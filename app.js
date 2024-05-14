require('dotenv').config();
const express = require('express')
const app = express()
const path = require('path')
const routes = require('./backend/api-route-controller')
const cors = require('cors');
const bodyParser = require('body-parser');
const PORT = process.env.PORT || 4244;

app.use(express.static(path.join(__dirname, 'frontend')));
app.use(express.static(path.join(__dirname, 'backend')));
app.use(cors());
app.use(bodyParser.json())

app.use(
    bodyParser.urlencoded({
        extended: true,
    })
);
app.use(
    cors({
        origin: '*',
    })
);
app.use(routes)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/index.html'));
});

app.listen(PORT, () =>{
    console.log('Server listening to port: ',PORT)
});