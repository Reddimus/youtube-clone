import express from 'express';
import ffmpeg from 'fluent-ffmpeg';

const app = express();
app.use(express.json());

app.post('/process-video', (req, res) => {

  // Get the path of the input video file from the request body
  const inputFilePath = req.body.inputFilePath;
  const outputFilePath = req.body.outputFilePath;

  // Check if the input file path is defined
  if (!inputFilePath) {
    return res.status(400).send('Bad Request: Missing input file path');
  } else if (!outputFilePath) {
    return res.status(400).send('Bad Request: Missing output file path');
  }

  // Create the ffmpeg command
  ffmpeg(inputFilePath)
    .outputOptions('-vf', 'scale=-1:360') // 360p
    .on('end', function() {
      let message = 'Processing finished successfully';
      console.log(message);
      res.status(200).send(message);
    })
    .on('error', function(err: any) {
      let message = 'An error occurred: ' + err.message;
      console.log(message);
      res.status(500).send(message);
    })
    .save(outputFilePath);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log(`http://localhost:${port}/process-video`);
});
