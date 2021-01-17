const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();

const ds = require('./datastore');

const datastore = ds.datastore;

const BOAT = "Boat";
const LOAD = "Load";

router.use(bodyParser.json());

/* ------------- Helper Functions ------------- */

function get_Count(db) {
    var c = datastore.createQuery(db);
    return datastore.runQuery(c).then( (entities) => {
        return entities[0].length;
    });
}

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

/* ------------- Begin Load Model Functions ------------- */
function post_load(weight, content, delivery_date){
    var key = datastore.key(LOAD);
	const new_load = {"weight": weight, "content": content, "delivery_date": delivery_date, "carrier": null};
	return datastore.save({"key":key, "data":new_load}).then(() => {return key});
}

function get_load(id){
    const key = datastore.key([LOAD, parseInt(id,10)]);
    return datastore.get(key).then((entity) => {return entity;});
}

function get_loads(req){
    return get_Count(LOAD).then( (c) => {
        var q = datastore.createQuery(LOAD).limit(5);
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

function delete_load(id){
    const key = datastore.key([LOAD, parseInt(id,10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0]) {
            const q = datastore.createQuery(BOAT);
            datastore.runQuery(q).then((entities) => {
                entities.forEach(function(item) {
                    for (var i = 0; i < item[0].loads.length; i++) {
                        if (item[0].loads[i] == id) {
                            item[0].loads.splice(i, 1);
                        }
                    }
                });
            });
            return datastore.delete(key).then(() => {return 204});
        }
        else return 404;
    });
}

function patch_load(req) {
    const key = datastore.key([LOAD, parseInt(req.params.id,10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0]) {
            if (req.body.weight) entity[0].weight = req.body.weight;
            if (req.body.content) entity[0].content = req.body.content;
            if (req.body.delivery_date) entity[0].delivery_date = req.body.delivery_date;
            return datastore.update({"key":key, "data":entity[0]}).then(() => {return entity[0]});
        } else return null;
    });
}

function put_load(id, weight, content, delivery_date, carrier){
    const key = datastore.key([LOAD, parseInt(id,10)]);
    const load = {"weight": weight, "content": content, "delivery_date": delivery_date, "carrier": carrier};
    return datastore.save({"key":key, "data":load}).then(() => {return key});
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

/* /loads */
router.post('/', function(req, res){
    if (!req.accepts('application/json')) res.status(406).send({Error:"The requested response media type is not supported"});
    else {
        if ('weight' in req.body && 'content' in req.body && 'delivery_date' in req.body) {
            if (isValidInt(req.body.weight) && isValidString(req.body.content)) {
                post_load(req.body.weight, req.body.content, req.body.delivery_date).then( key => {
                    var myJson = {"id":key.id, "weight": req.body.weight, "content": req.body.content, "delivery_date": req.body.delivery_date, "carrier":null, "self":'https://' + req.get('host') + req.originalUrl + '/' + key.id};
                    res.status(201).json(myJson);
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
        const loads = get_loads(req).then( (loads) => {
            var myJson = loads;
            for (var i = 0; i < myJson.items.length; i++) {
                myJson.items[i].self = 'https://' + req.get('host') + '/loads/' + myJson.items[i].id;
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

/* /loads/:id */
router.post('/:id', function(req, res){
    res.set('Allow', 'GET, PATCH, PUT, DELETE');
    res.status(405).send();
});

router.get('/:id', function(req, res){
    if (!req.accepts('application/json')) res.status(406).send({Error:"The requested response media type is not supported"});
    else {
        get_load(req.params.id).then( (load) => {
            if (load[0]) {
                var myJson = load[0];
                myJson["self"] = 'https://' + req.get('host') + req.originalUrl;
                myJson["id"] = req.params.id;
                res.status(200).json(myJson);
            } else {
                res.status(404).send({Error:"No load with this id exists"});
            }
        });
    }
});

router.patch('/:id', function(req, res) {
    if (!req.accepts('application/json')) res.status(406).send({Error:"The requested response media type is not supported"});
    else {
        if ((req.body.weight && !isValidInt(req.body.weight)) || (req.body.content && !isValidString(req.body.content))) {
            res.status(400).send({Error:"The request object has at least one missing or invalid attribute"});
        }
        else {
            const load = get_load(req.params.id).then( (old_load) => {
                if (!old_load[0]) res.status(404).send({Error:"No load with this id exists"});
                else {
                    patch_load(req).then( load => {
                        res.status(200).json(JSON.parse(
                            '{ "id": ' + req.params.id + 
                            ', "weight": ' + load.weight + 
                            ', "content": "' + load.content +
                            '", "delivery_date": "' + load.delivery_date +
                            '", "self": "https://' + req.get('host') + req.originalUrl + '"}'
                    ))});    
                }
            });
        }
    }
});

router.put('/:id', function(req, res) {
    if (!req.accepts('application/json')) res.status(406).send({Error:"The requested response media type is not supported"});
    else {
        if ('weight' in req.body && 'content' in req.body && 'delivery_date' in req.body) {
            if (isValidInt(req.body.weight) && isValidString(req.body.content)) {
                const load = get_load(req.params.id).then( (old_load) => {
                    if (!old_load[0]) res.status(404).send({Error:"No load with this id exists"});
                    else { 
                        put_load(req.params.id, req.body.weight, req.body.content, req.body.delivery_date, old_load[0].carrier).then( key => {
                            res.status(303).set('Location', 'https://' + req.get('host') + req.originalUrl).json(JSON.parse(
                            '{ "id": ' + key.id + 
                            ', "weight": ' + req.body.weight + 
                            ', "content": "' + req.body.content +
                            '", "delivery_date": "' + req.body.delivery_date +
                            '", "self": "https://' + req.get('host') + req.originalUrl + '"}'
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

router.delete('/:id', function(req, res){
    if (!req.accepts('application/json')) res.status(406).send({Error:"The requested response media type is not supported"});
    else {
        get_load(req.params.id).then( (load) => {
            if (load[0]) {
                delete_load(req.params.id).then(res.status(204).end());
            } else res.status(404).send({Error:"No load with this id exists"});
        });
    }
});

/* ------------- End Controller Functions ------------- */

module.exports = router;