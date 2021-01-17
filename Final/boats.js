const express = require('express');
const bodyParser = require('body-parser');
const queryString = require('query-string');
const router = express.Router();
const ds = require('./datastore');
const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');

const datastore = ds.datastore;

const BOAT = "Boat";
const LOAD = "Load";

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: true }));

/* ----------------- Middleware ------------------- */

const checkJwt = jwt({
    secret: jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://www.googleapis.com/oauth2/v3/certs`
    }),
  
    // Validate the audience and the issuer.
    issuer: `https://accounts.google.com`,
    algorithms: ['RS256']
  });

/* ------------- Helper Functions ------------- */

//Only alphanumeric characters and whitespaces are allowed in the string.
//Whitespaces cannot be the first character or the only character of the string.
//String cannot be empty.
function isValidString(str){
    return (typeof str == "string" && str.search(/^[a-z0-9\s]+$/i) == 0 && str.search(/\S/) == 0 && str.length <= 28);
}

//String representations of integers are allowed.
//Value must be greater than 0.
function isValidInt(integer){
    console.log("testing int: " + integer + "\n");
    return parseInt(integer, 10) > 0;
}

function isUniqueName(str){
    const q = datastore.createQuery(BOAT);
    return datastore.runQuery(q).then((entities) => {
        var result = true;
        entities[0].forEach(function(item) {
            console.log("Match: " + str + " = " + item.name + ": " + (str == item.name) + "\n");
            if (str == item.name) result = false;
        });
        return result;
    });
}

function get_Count(db) {
    var c = datastore.createQuery(db);
    return datastore.runQuery(c).then( (entities) => {
        return entities[0].length;
    });
}

/* ------------- Begin Boat Model Functions ------------- */
function post_boat(name, type, length, owner){
    var key = datastore.key(BOAT);
	const new_boat = {"name": name, "type": type, "length": length, "loads": [], "owner": owner};
	return datastore.save({"key":key, "data":new_boat}).then(() => {return key});
}

function get_boat(id){
    const key = datastore.key([BOAT, parseInt(id,10)]);
    return datastore.get(key).then((entity) => {return entity;});
}

function get_boats(req){
    return get_Count(BOAT).then( (c) => {
        var q = datastore.createQuery(BOAT).limit(5);
        const results = {};
        if(Object.keys(req.query).includes("cursor")){
            q = q.start(req.query.cursor);
        }
        return datastore.runQuery(q).then( (entities) => {
            results.items = entities[0].map(ds.fromDatastore);
            results.entries = c;
            if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS ){
                results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
            }
            return results;
        });
    });
}

function patch_boat(req) {
    const key = datastore.key([BOAT, parseInt(req.params.id,10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0]) {
            if (req.body.name) entity[0].name = req.body.name;
            if (req.body.type) entity[0].type = req.body.type;
            if (req.body.length) entity[0].length = req.body.length;
            return datastore.update({"key":key, "data":entity[0]}).then(() => {return entity[0]});
        } else return null;
    });
}

function put_boat(id, name, type, length, loads, owner){
    const key = datastore.key([BOAT, parseInt(id,10)]);
    const boat = {"name": name, "type": type, "length": length, "loads": loads, "owner": owner};
    return datastore.save({"key":key, "data":boat}).then(() => {return key});
}

function delete_boat(id){
    const key = datastore.key([BOAT, parseInt(id,10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0]) {
            const q = datastore.createQuery(LOAD);
            return datastore.runQuery(q).then((entities) => {
                const results = entities[0].map(ds.fromDatastore);
                results.forEach(function(item) {
                    console.log(JSON.stringify(item));
                    if (item.carrier == id) {
                        const data = item;
                        const l_key = datastore.key([LOAD, parseInt(item.id,10)]);
                        data.carrier = null;
                        datastore.save({"key":l_key, "data":data});
                    }
                });
                return datastore.delete(key).then(() => {return 204});
            });
        }
        else return 404;
    });
}


function get_boat_loads(req, id){
    const key = datastore.key([BOAT, parseInt(id,10)]);
    return datastore.get(key)
    .then( (boat) => {
        const my_boat = boat[0];
        const load_keys = my_boat.loads.map( (l_id) => {
            return datastore.key([LOAD, parseInt(l_id,10)]);
        });
        return datastore.get(load_keys);
    })
    .then((loads) => {
        loads = loads[0].map(ds.fromDatastore);
        return loads;
    });
}

function put_boat_load(lid, bid){
    const l_key = datastore.key([LOAD, parseInt(lid,10)]);
    return datastore.get(l_key).then((entity) => {
        if (entity[0]) {
            if (entity[0].carrier) {
                return 403;
            } else {
                entity[0].carrier = bid;
                datastore.save({"key":l_key, "data":entity[0]});
                const b_key = datastore.key([BOAT, parseInt(bid,10)]);
                return datastore.get(b_key).then((boat) => {
                    if( typeof(boat[0].loads) === 'undefined'){
                        boat[0].loads = [];
                    }
                    boat[0].loads.push(lid);
                    return datastore.save({"key":b_key, "data":boat[0]}).then(() => {return 204});
                });
            }
        } else return 404;
    });
}

function delete_boat_load(lid, bid){
    const l_key = datastore.key([LOAD, parseInt(lid,10)]);
    return datastore.get(l_key).then((entity) => {
        if (entity[0]) {
            if (entity[0].carrier != bid) {
                return 404;
            } else {
                entity[0].carrier = null;
                datastore.save({"key":l_key, "data":entity[0]});
                const b_key = datastore.key([BOAT, parseInt(bid,10)]);
                return datastore.get(b_key).then((boat) => {
                    console.log("length: " + boat[0].loads.length);
                    for(var i = 0; i < boat[0].loads.length; i++) {
                        if (boat[0].loads[i] == lid) {
                            boat[0].loads.splice(i, 1);   
                        }
                    }
                    return datastore.save({"key":b_key, "data":boat[0]}).then(() => {return 204});
                });
            }
        } else return 404;
    });
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

/* /boats */
router.post('/', checkJwt, function(req, res){
    if (!req.accepts('application/json')) res.status(406).send({Error:"The requested response media type is not supported"});
    else if (!req.headers.authorization) res.status(401).send({Error:"Could not find a boat with the given id belonging to the owner in the JWT."});
    else {
        if ('name' in req.body && 'type' in req.body && 'length' in req.body) {
            if (isValidString(req.body.name) && isValidString(req.body.type) && isValidInt(req.body.length)) {
                isUniqueName(req.body.name).then( isunique => {
                    console.log(isunique);
                    if (isunique == false) res.status(403).send({Error:"The name attribute of the request object is not unique"});
                    else {
                        post_boat(req.body.name, req.body.type, req.body.length, req.user.sub).then( key => {res.status(201).json(JSON.parse(
                            '{ "id": ' + key.id + 
                            ', "name": "' + req.body.name + 
                            '", "type": "' + req.body.type +
                            '", "length": ' + req.body.length +
                            ', "loads": []' +
                            ', "owner": "' + req.user.sub +
                            '", "self": "https://' + req.get('host') + req.originalUrl + '/' + key.id + '"}'
                        ))});
                    }
                });
            } else {
                res.status(400).send({Error:"The request object has at least one missing or invalid attribute"});
            }
        } else {
            res.status(400).send({Error:"The request object has at least one missing or invalid attribute"});
        }
    }
});

router.get('/', function(req, res){
    if (!req.accepts('application/json')) res.status(406).send({Error:"The requested response media type is not supported"});
    else {
        const boats = get_boats(req).then((boats) => {
            var myJson = boats;
            for (var i = 0; i < myJson.items.length; i++) {
                myJson.items[i].self = 'https://' + req.get('host') + req.originalUrl + '/' + myJson.items[i].id;
            }
            res.status(200).json(myJson);
        });
    }
});

router.patch('/', function(req, res){
    res.set('Allow', 'POST, GET');
    res.status(405).send();
});

router.put('/', function(req, res){
    res.set('Allow', 'POST, GET');
    res.status(405).send();
});

router.delete('/', function(req, res){
    res.set('Allow', 'POST, GET');
    res.status(405).send();
});

/* /boats/:id */
router.post('/:id', function(req, res){
    res.set('Allow', 'GET, PATCH, PUT, DELETE');
    res.status(405).send();
});

router.get('/:id', checkJwt, function(req, res){
    if (!req.accepts('application/json')) res.status(406).send({Error:"The requested response media type is not supported"});
    else if (!req.headers.authorization) res.status(401).send({Error:"Could not find a boat with the given id belonging to the owner in the JWT."});
    else {
        get_boat(req.params.id).then( (boat) => {
            if (boat[0]) {
                if (boat[0].owner != req.user.sub) {
                    res.status(401).send({Error:"Could not find a boat with the given id belonging to the owner in the JWT."});
                }
                var myJson = boat[0];
                myJson["self"] = 'https://' + req.get('host') + req.originalUrl;
                myJson["id"] = req.params.id;
                res.status(200).json(myJson);
            } else {
            res.status(404).send({Error:"No boat with this id exists"});
        }
        });
    }
});

router.patch('/:id', checkJwt, function(req, res) {
    if (!req.accepts('application/json')) res.status(406).send({Error:"The requested response media type is not supported"});
    else if (!req.headers.authorization) res.status(401).send({Error:"Could not find a boat with the given id belonging to the owner in the JWT."});
    else {
        if ((req.body.name && !isValidString(req.body.name)) || (req.body.type && !isValidString(req.body.type)) || (req.body.length && !isValidInt(req.body.length))) {
            res.status(400).send({Error:"The request object has at least one missing or invalid attribute"});
        }
        else {
            isUniqueName(req.body.name).then( result => {
                if (result == false) res.status(403).send({Error:"The name attribute of the request object is not unique"});
                else {
                    const boat = get_boat(req.params.id).then( (old_boat) => {
                        if (!old_boat[0]) res.status(404).send({Error:"No boat with this id exists"});
                        else if (old_boat[0].owner != req.user.sub) {
                            res.status(401).send({Error:"Could not find a boat with the given id belonging to the owner in the JWT."});
                        }
                        else {
                            patch_boat(req).then( boat => {
                                var loads = boat.loads;
                                if (loads.length == 0) loads = "[]";
                                res.status(200).json(JSON.parse(
                                    '{ "id": ' + req.params.id + 
                                    ', "name": "' + boat.name +
                                    '", "type": "' + boat.type +
                                    '", "length": ' + boat.length +
                                    ', "loads": ' + loads +
                                    ', "owner": "' + boat.owner +
                                    '", "self": "https://' + req.get('host') + req.originalUrl + '"}'
                            ))});    
                        }
                    });
                }
            });
        }
    }
});

router.put('/:id', checkJwt, function(req, res) {
    if (!req.accepts('application/json')) res.status(406).send({Error:"The requested response media type is not supported"});
    else if (!req.headers.authorization) res.status(401).send({Error:"Could not find a boat with the given id belonging to the owner in the JWT."});
    else {
        if ('name' in req.body && 'type' in req.body && 'length' in req.body) {
            if (isValidString(req.body.name) && isValidString(req.body.type) && isValidInt(req.body.length)) {
                const boat = get_boat(req.params.id).then( (old_boat) => {
                    if (!old_boat[0]) res.status(404).send({Error:"No boat with this id exists"});
                    else if (old_boat[0].owner != req.user.sub) {
                        res.status(401).send({Error:"Could not find a boat with the given id belonging to the owner in the JWT."});
                    }
                    else {
                        isUniqueName(req.body.name).then( isunique => {
                            if (isunique == false) res.status(403).send({Error:"The name attribute of the request object is not unique"});
                            else {
                                put_boat(req.params.id, req.body.name, req.body.type, req.body.length, old_boat[0].loads, old_boat[0].owner).then( key => {
                                    var loads = old_boat[0].loads;
                                    if (loads.length == 0) loads = "[]";
                                    res.status(303).set('Location', 'https://' + req.get('host') + req.originalUrl).json(JSON.parse(
                                    '{ "id": ' + key.id + 
                                    ', "name": "' + req.body.name + 
                                    '", "type": "' + req.body.type +
                                    '", "length": ' + req.body.length +
                                    ', "loads": ' + loads +
                                    ', "owner": "' + old_boat[0].owner +
                                    '", "self": "https://' + req.get('host') + req.originalUrl + '"}'
                                ))});    
                            }
                        });
                    }
                });
            } else {
                res.status(400).send({Error:"The request object has at least one missing or invalid attribute"});
            }
        } else {
            res.status(400).send({Error:"The request object has at least one missing or invalid attribute"});
        }
    }
});

router.delete('/:id', checkJwt, function(req, res){
    if (!req.headers.authorization) res.status(401).send({Error:"Could not find a boat with the given id belonging to the owner in the JWT."});
    else {
        get_boat(req.params.id).then( (boat) => {
            if (boat[0]) {
                if (boat[0].owner != req.user.sub) {
                    res.status(401).send({Error:"Could not find a boat with the given id belonging to the owner in the JWT."});
                }
                else {
                    delete_boat(req.params.id).then((status_code) => {
                        if (status_code === 404) {
                            res.status(404).send({Error:"No boat with this id exists"})
                        } else if (boat[0].owner != req.user.sub) {
                            res.status(401).send({Error:"Could not find a boat with the given id belonging to the owner in the JWT."});
                        } else if (status_code === 204) {
                            res.status(204).send();
                        } else res.status(500).send({Error:"Unkown Error"});
                    });
                }
            } else res.status(404).send({Error:"No boat with this id exists"});
        });
    }
});

/* /boats/:id/loads */
router.post('/:id/loads', function(req, res){
    res.set('Allow', 'GET');
    res.status(405).send();
});

router.get('/:id/loads', checkJwt, function(req, res){
    if (!req.accepts('application/json')) res.status(406).send({Error:"The requested response media type is not supported"});
    else if (!req.headers.authorization) res.status(401).send({Error:"Could not find a boat with the given id belonging to the owner in the JWT."});
    else {
        get_boat(req.params.id).then( (boat) => {
            if (boat[0]) {
                if (boat[0].owner != req.user.sub) {
                    res.status(401).send({Error:"Could not find a boat with the given id belonging to the owner in the JWT."});
                }
                get_boat_loads(req, req.params.id).then( (loads) => {
                    res.status(200).json(loads);
                });
            } else res.status(404).send({Error:"No boat with this id exists"});
        });
    }
});

router.patch('/:id/loads', function(req, res){
    res.set('Allow', 'GET');
    res.status(405).send();
});

router.put('/:id/loads', function(req, res){
    res.set('Allow', 'GET');
    res.status(405).send();
});

router.delete('/:id/loads', function(req, res){
    res.set('Allow', 'GET');
    res.status(405).send();
});

/* /boats/:bid/loads/:lid */
router.post('/:bid/loads/:lid', function(req, res){
    res.set('Allow', 'PUT, DELETE');
    res.status(405).send();
});

router.get('/:bid/loads/:lid', function(req, res){
    res.set('Allow', 'PUT, DELETE');
    res.status(405).send();
});

router.patch('/:bid/loads/:lid', function(req, res){
    res.set('Allow', 'PUT, DELETE');
    res.status(405).send();
});

router.put('/:bid/loads/:lid', checkJwt, function(req, res){
    if (!req.accepts('application/json')) res.status(406).send({Error:"The requested response media type is not supported"});
    else if (!req.headers.authorization) res.status(401).send({Error:"Could not find a boat with the given id belonging to the owner in the JWT."});
    else {
        get_boat(req.params.bid).then( (boat) => {
            if (boat[0]) {
                if (boat[0].owner != req.user.sub) {
                    res.status(401).send({Error:"Could not find a boat with the given id belonging to the owner in the JWT."});
                }
                put_boat_load(req.params.lid, req.params.bid).then((code) => {
                    res.status(code);
                    if (code === 404) {
                        res.send({Error:"The specified boat and/or load don’t exist"});
                    } else if (code === 403) {
                        res.send({Error:"The load is already assigned to a boat"});
                    } else if (code === 204) {
                        res.send();
                    } else res.send({Error:"Unknown status code"});
                });
            } else res.status(404).send({Error:"The specified boat and/or load don’t exist"});
        });
    }
});

router.delete('/:bid/loads/:lid', checkJwt, function(req, res){
    if (!req.accepts('application/json')) res.status(406).send({Error:"The requested response media type is not supported"});
    else {
        if (!req.headers.authorization) res.status(401).send({Error:"Could not find a boat with the given id belonging to the owner in the JWT."});
        get_boat(req.params.bid).then( (boat) => {
            if (boat[0]) {
                delete_boat_load(req.params.lid, req.params.bid).then((code) => {
                    res.status(code);
                    if (code === 404) {
                        res.send({Error:"No boat with this bid has a load with this lid"});
                    } else if (boat[0].owner != req.user.sub) {
                        res.status(401).send({Error:"Could not find a boat with the given id belonging to the owner in the JWT."});
                    } else if (code === 404) {
                        res.send({Error:"No boat with this bid has a load with this lid"});
                    } else if (code === 204) {
                        res.send();
                    } else res.send({Error:"Unknown status code"});
                });
            } else res.status(404).send({Error:"No boat with this bid has a load with this lid"});
        });
    }
});

/* ------------- End Controller Functions ------------- */

module.exports = router;