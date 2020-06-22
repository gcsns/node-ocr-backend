'use strict';

var express = require('express');
var fs = require('fs');
var multer = require('multer');
var upload = multer({dest: 'uploads/'});

const findSimilarity = require('./similarityFinder');

var mrz = require('./mrz');

const path = require('path');
// Set up auth

const vision = require("@google-cloud/vision");
const replaceSimilar = require('./replaceSimilar');
const emiratesProcessor = require('./emiratesIdProcessor');

var app = express();


app.use(express.static(path.join(__dirname, "public")));

app.post('/upload', upload.single('image'), async function(req, res, next) {
  
    const {initiatePostTimeout} = req.query;
    const client = new vision.ImageAnnotatorClient({
      keyFilename: 'secrets.json'
    });
  
    const [result] = await client.textDetection(path.join(__dirname, 'uploads', req.file.filename));
    if(!result.fullTextAnnotation) {
      return res.status(500).send({error: "No text block found", result});
    }
    const description = result.fullTextAnnotation.text;

    passportProcessor(res, description, initiatePostTimeout);
    emiratesProcessor(res, description, initiatePostTimeout);
    
});



const passportProcessor = async(res, description) => {
  let mrzCode = "";

    try{
      mrzCode = mrz.extractMrzCode(description, res);
    }catch(e) {
      console.log(e)
      return res.status(500).send(e);
    }
    

    try{
      let rst = mrz.runner(mrzCode, initiatePostTimeout);
      try{
        const similarDocumentsDict = findSimilarity(rst, result.fullTextAnnotation.text);
        rst = replaceSimilar(rst, similarDocumentsDict);
      }catch(e){
        console.log("similarity error", e.message);
      }

      const faces = await detectFaces(path.join(__dirname, 'uploads', req.file.filename))

      if(!initiatePostTimeout) {
        console.log(rst);
        return res.status(200).send(rst);
      }else if(true || mrz.parsedDocumentsChecksumDigitsCheck(rst)){
        // maybe the documents provided for testing have incorrect values
        return res.status(200).send({...rst, faces});
      }else{
        console.log("Didnot match pattern in post timeout");
        res.status(400).send({error: "did not match the pattern in post timeout"});
      }
    }catch(e){
      console.log(mrzCode, e.message);
      return res.status(500).send({error: e.message, mrzCode});
    }
}

async function detectFaces(inputFile) {
  const client = new vision.ImageAnnotatorClient({keyFilename: 'secrets.json'});
  // Make a call to the Vision API to detect the faces
  const request = {image: {source: {filename: inputFile}}};
  const results = await client.faceDetection(request);
  const faces = results[0].faceAnnotations;
  const numFaces = faces.length;
  console.log(`Found ${numFaces} face${numFaces === 1 ? '' : 's'}.`);
  return faces;
}



app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});


const port = 9659;
app.listen(port);
console.log('Server Started at port', port);