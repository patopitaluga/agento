import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { audioService } from './controllers/receive-audio.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const { handleAudioPostController } = audioService.init();

app.use(express.urlencoded());
app.use(express.json());

app.use(express.static('public'));
app.use('/components', express.static('components'));

app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, './views/index.html'));
});

app.post('/audio', handleAudioPostController);

app.listen(process.env.PORT || 3001, () => {
  console.log('App listening on port ' + (process.env.PORT || 3001));
});
