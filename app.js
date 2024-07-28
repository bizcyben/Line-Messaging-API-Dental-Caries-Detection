const express = require('express');
const line = require('@line/bot-sdk');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');

const imagesDir = path.join(__dirname, 'images');
fs.mkdir(imagesDir, { recursive: true }).catch(console.error);

const app = express();
const config = {
  //change 
  channelAccessToken: 'your channelAccessToken',
  channelSecret: 'your channelSecret'
};

const client = new line.Client(config);

app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    const events = req.body.events;
    const results = await Promise.all(events.map(handleEvent));
    res.json(results);
  } catch (error) {
    console.error('Error in webhook handler:', error);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'image') {
    return null;
  }

  try {
    const imagePath = await downloadImage(event.message.id);
    const { outputPath: detectedImagePath, detections } = await runYoloModel(imagePath);

    let messages = [];

    if (detections && detections.length > 0) {
      const detectionText = detections.map(d => `${d.name} (${Math.round(d.confidence * 100)}%)`).join(', ');
      messages.push({ type: 'text', text: `ตรวจพบ: ${detectionText}` });

      const colorExplanation = "สีที่ใช้: \n 🟢เขียว=Initial(ระยะแรกเริ่ม)\n 🟡เหลือง=Moderate(ระยะปานกลาง)\n 🔴แดง=Advanced(ระยะรุนแรง)";
      messages.push({ type: 'text', text: colorExplanation });
    } else {
      messages.push({ type: 'text', text: 'ไม่พบวัตถุที่ตรงกับเงื่อนไขในภาพ' });
    }
    //copy path from ngrok
    const imageUrl = `your localhost/images/${path.basename(detectedImagePath)}`;
    console.log('Image URL:', imageUrl);

    messages.push({
      type: 'image',
      originalContentUrl: imageUrl,
      previewImageUrl: imageUrl
    });

    console.log('Sending messages:', JSON.stringify(messages));
    await client.replyMessage(event.replyToken, messages);

    // Send follow-up message
    await client.pushMessage(event.source.userId, { type: 'text', text: 'นัดคิวเข้ารับการรักษากดลิงค์นี้👇\n https://page.line.me/475ptmfj ' });
    await client.pushMessage(event.source.userId, { type: 'text', text: 'เพื่อสุขภาพฟันที่ดีของน้องๆ👍🏻!!!' });

    await fs.unlink(imagePath);
    await fs.unlink(detectedImagePath);

    console.log('Task completed successfully');

  } catch (error) {
    console.error('Error processing image:', error);
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'เกิดข้อผิดพลาดในการประมวลผลภาพ กรุณาลองใหม่อีกครั้ง'
    });
  }
}

async function downloadImage(messageId) {
  try {
    const stream = await client.getMessageContent(messageId);
    const imagePath = path.join(__dirname, 'images', `${messageId}.jpg`);
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    await fs.writeFile(imagePath, Buffer.concat(chunks));
    return imagePath;
  } catch (error) {
    console.error('Error downloading image:', error);
    throw error;
  }
}

async function runYoloModel(imagePath) {
  const outputPath = imagePath.replace('.jpg', '_detected.jpg');
  const modelPath = path.join(__dirname, 'best.pt');
  return new Promise((resolve, reject) => {
    exec(`python yolo_model.py "${modelPath}" "${imagePath}"`, (error, stdout, stderr) => {
      if (error) {
        console.error('Error running YOLO model:', error);
        console.error('YOLO model stderr:', stderr);
        reject(error);
      } else {
        try {
          const jsonOutput = stdout.split('\n').find(line => line.startsWith('{'));
          if (!jsonOutput) {
            throw new Error('No JSON output found');
          }
          const result = JSON.parse(jsonOutput);
          if (result.error) {
            reject(new Error(result.error));
          } else {
            resolve({
              outputPath: result.output_path,
              detections: result.detections
            });
          }
        } catch (parseError) {
          console.error('Error parsing YOLO model output:', parseError);
          console.error('YOLO model stdout:', stdout);
          reject(parseError);
        }
      }
    });
  });
}

app.use('/images', express.static('images'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
