const { MongoClient } = require('mongodb');

// Sua string de conexão (cole a sua aqui dentro das aspas)
const uri = process.env.MONGO_URI;//oburgog_db_user:V4Power%40400@cluster0.kv5pjjk.mongodb.net/?appName=Cluster0";
// OBS: Troquei o '@' da senha por '%40' para evitar bugs!

const client = new MongoClient(uri);

let db;

async function connectDB() {
    if (db) return db;
    try {
        await client.connect();
        console.log("✅ Conectado ao MongoDB!");
        db = client.db("LojaPowerTech"); // Nome do seu banco
        return db;
    } catch (error) {
        console.error("❌ Erro ao conectar no Mongo:", error);
        process.exit(1);
    }
}

module.exports = connectDB;