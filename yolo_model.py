import sys
import os
import json
import cv2
from ultralytics import YOLO

# กำหนดสีสำหรับแต่ละคลาส ในรูปแบบ BGR
COLORS = {
    'initial': (34,139,34),    # สีเขียว
    'moderate': (0,255,255), # สีเหลือง 
    'advanced': (0, 0, 255)    # สีแดง
}

def detect_objects(model_path, image_path):
    try:
        model = YOLO(model_path)
        results = model(image_path)
        
        detections = []
        img = cv2.imread(image_path)
        
        for r in results:
            boxes = r.boxes
            for box in boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
                confidence = float(box.conf[0])
                class_id = int(box.cls[0])
                label = model.names[class_id]
                
                detections.append({
                    "name": label,
                    "confidence": confidence,
                    "bbox": [x1, y1, x2, y2]
                })
                
                # ใช้สีที่กำหนดไว้หรือสีขาวถ้าไม่มีสีที่กำหนด
                color = COLORS.get(label.lower(), (255, 255, 255))
                
                cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
                cv2.putText(img, f"{label} {confidence:.2f}", (x1, y1 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.9, color, 2)
        
        output_path = f"{os.path.splitext(image_path)[0]}_detected.jpg"
        cv2.imwrite(output_path, img)
        
        print(f"Detections: {detections}")  # เพิ่ม logging
        print(f"Output saved to: {output_path}")  # เพิ่ม logging
        
        return detections, output_path
    except Exception as e:
        print(f"Error in detect_objects: {str(e)}")  # เพิ่ม logging
        return None, str(e)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(json.dumps({"error": "Usage: python yolo_model.py <model_path> <image_path>"}))
        sys.exit(1)
    
    model_path = sys.argv[1]
    image_path = sys.argv[2]
    
    detections, output = detect_objects(model_path, image_path)
    if detections is None:
        print(json.dumps({"error": output}))
    else:
        print(f"Detected {len(detections)} objects")
        print(json.dumps({"detections": detections, "output_path": output}))