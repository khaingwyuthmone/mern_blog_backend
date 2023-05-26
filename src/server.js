import express, { response } from 'express';
import cors from 'cors';
import { db,connectToDb } from './db.js';
import fs from 'fs';
import admin from 'firebase-admin';
import path from 'path';
import 'dotenv/config.js'
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const credentials = JSON.parse(
    fs.readFileSync('./credentials.json')
)

admin.initializeApp({
    credential : admin.credential.cert(credentials)
})

const app = express();
app.use(express.json());  // use middleware
app.use(express.static(path.join(__dirname, '../build')))

app.get(/^(?!\/api).+/, (req,res) => {
    res.sendFile(path.join(__dirname, '../build/index.html'));
})

app.use(async (req,res, next)=> {
    const {authtoken} = req.headers;
    if(authtoken){
        try{
            req.user = await admin.auth().verifyIdToken(authtoken);
        }catch(e){
            return res.sendStatus(400);
        }
        
    }
    req.user = req.user || {};
    next();
})

app.use(cors());  // for cross-side checking

app.get('/api/articles/:name', async (request, response) => {
    const {name} = request.params;
    const {uid}  = request.user;

    const article = await db.collection('articles').findOne({name});
    if(article){
        const upvoteIds = article.upvoteIds || [];
        article.canUpvote = uid && !upvoteIds.includes(uid);
        response.json(article);
    }else{
        response.sendStatus(404);
    }
    
});

app.use((req,res,next) => {
    if(req.user){
        next();
    }else{
        res.sendStatus(401);
    }
});

app.put('/api/articles/:name/upvote', async(request,response)=>{
    const {name}  = request.params;
    const {uid}   = request.user;

    const article   = await db.collection('articles').findOne({name});
    if(article){
        const upvoteIds = article.upvoteIds || [];
        const canUpvote = uid && !upvoteIds.includes(uid);
        if(canUpvote){
            await db.collection('articles').updateOne({name}, {
                $inc : {upvotes : 1},
                $push : {upvoteIds : uid}
            });
        }
        const updatedArticle   = await db.collection('articles').findOne({name});
        response.json(updatedArticle);
    }else{
        response.send(`That article doesn't exist.`);
    }
});

app.post('/api/articles/:name/comments', async(request, response) => {
    const {  text } = request.body;
    const { name }         = request.params;
    const { email }         = request.user; 

    await db.collection('articles').updateOne({name}, {
        $push : {comments : {postedBy : email, text}}
    });

    const article   = await db.collection('articles').findOne({name});
    if(article){
        response.json(article)
    }else{
        response.send("We don't have this article.")
    }
});

const PORT = process.env.PORT || 8000 ;

connectToDb(()=>{
    app.listen(PORT, ()=> {
        console.log(`Server is listening on port ${PORT} `);
    });
})

