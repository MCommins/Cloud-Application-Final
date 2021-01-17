const bodyParser = require('body-parser');
const path = require('path');
const express = require('express');
const request = require('request');
const url = require('url');
const queryString = require('query-string');
const app = express();
const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');
const ds = require('./datastore');

const datastore = ds.datastore;

app.use('/', require('./index'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const BOAT = "Boat";
const CLIENT_ID = "184166913048-q97vl5poljnvbioedrb3gvbar7fqdcdd.apps.googleusercontent.com";
const CLIENT_SECRET = "lNUEIsDL93RcEKgsWlYFS4rS";

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

function get_boats(user_id){
  const q = datastore.createQuery(BOAT);
  return datastore.runQuery(q).then( (entities) => {
      return entities[0].map(ds.fromDatastore).filter( item => item.owner === user_id );
    });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/userinfo', (req, res) => {
  request.post('https://oauth2.googleapis.com/token', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      qs: {
        code: req.query.code,
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: 'https://comminsfinal.appspot.com/userinfo'
      }
    }, function (error, response, body) {
      var token = JSON.parse(body).id_token;
      res.status(200).send("Token: " + token);      
    });
});

app.get('/users/:user_id/boats', checkJwt, function(req, res){
	if (!req.accepts('application/json')) res.status(406).send({Error:"The requested response media type is not supported"});
	else if (!req.headers.authorization) res.status(401).send("JWT is missing!");
    else {
		if (req.user.sub != req.params.user_id) {
		    res.status(401).send("Owner supplied in JWT does not match :user_id parameter");
		  }
		  get_boats(req.params.user_id).then( (boats) => {
		    var myJson = boats;
		    for (i in myJson) {
		      myJson[i].self = 'https://' + req.get('host') + '/boats/' + myJson[i].id;
		    }
		    res.status(200).json(myJson);
		  });
	}  
});

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}...`);
});