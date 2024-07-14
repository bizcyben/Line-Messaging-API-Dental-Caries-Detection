const express = require('express');
const line = require('@line/bot-sdk');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');

// สร้างโฟลเดอร์ images ด้วย
const imagesDir = path.join(__dirname, 'images');
fs.mkdir(imagesDir, { recursive: true }).catch(console.error);
//copy channelAccessToken and chanelScret from Line Devoloper
const app = express();
const config = {
  channelAccessToken: 'c/ucBKfHIyZnxnwedmo7eTUyuTfOzubRqnZwpHVzCrvs+34eeoZaNx3APuH7t7IPekaZJ/tnFV0vg2o5GZwRqcRRHodAHYHabqiW4Onfg3iN4yC6z9r2Uv/+roMu7MyD8bnJR6ClHNQnY0eGTg3U8wdB04t89/1O/w1cDnyilFU=',
  channelSecret: '093d75037d81ef45708be8beaf8f60f6'
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
        
        // เพิ่มข้อความอธิบายสี
        const colorExplanation = "สีที่ใช้: Initial(ระยะแรกเริ่ม) - เขียว, Moderate(ระยะปานกลาง) - เหลือง, Advanced(ระยะรุนแรง) - แดง";
        messages.push({ type: 'text', text: colorExplanation });
      } else {
        messages.push({ type: 'text', text: 'ไม่พบวัตถุที่ตรงกับเงื่อนไขในภาพ' });
      }
  
      // copy https from ngrok amd replace on this host
      const imageUrl = `https://7554-61-7-228-206.ngrok-free.app/images/${path.basename(detectedImagePath)}`;
      messages.push({
        type: 'image',
        originalContentUrl: imageUrl,
        previewImageUrl: imageUrl
      });
  
      console.log('Sending messages:', JSON.stringify(messages));
      await client.replyMessage(event.replyToken, messages);
  
      
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