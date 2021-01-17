const {Datastore} = require('@google-cloud/datastore');

module.exports.Datastore = Datastore;
const projectId = 'comminsfinal';
module.exports.datastore = new Datastore({projectId:projectId});
module.exports.fromDatastore = function fromDatastore(item){
    item.id = item[Datastore.KEY].id;
    return item;
}