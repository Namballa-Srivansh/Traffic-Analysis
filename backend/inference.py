import sys
import json
import os
import cv2
import logging
from ultralytics import YOLO

# Suppress YOLO logs
logging.getLogger("ultralytics").setLevel(logging.ERROR)

def main():
    if len(sys.argv) < 3:
        sys.exit(1)

    image_path = sys.argv[1]
    output_dir = sys.argv[2]
    os.makedirs(output_dir, exist_ok=True)
    
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        model_path = os.path.join(script_dir, 'models', 'best.pt')
        model = YOLO(model_path)
        results = model(image_path, verbose=False)
        
        # Save plotted image
        res_plotted = results[0].plot()
        out_img_path = os.path.join(output_dir, 'result.jpg')
        cv2.imwrite(out_img_path, res_plotted)
        
        # Extract counts
        class_names = results[0].names
        detected_classes = results[0].boxes.cls.cpu().numpy()
        
        counts = {}
        for cls in detected_classes:
            name = class_names[int(cls)]
            counts[name] = counts.get(name, 0) + 1
            
        out_json_path = os.path.join(output_dir, 'counts.json')
        with open(out_json_path, 'w') as f:
            json.dump(counts, f)
            
    except Exception as e:
        out_err_path = os.path.join(output_dir, 'error.txt')
        with open(out_err_path, 'w') as f:
            f.write(str(e))

if __name__ == "__main__":
    main()
