import cv2
import numpy as np
import os
import subprocess
import imageio_ffmpeg

def create_sample_traffic_video():
    samples_dir = os.path.abspath("../frontend/public/samples")
    img1_path = os.path.join(samples_dir, "sample-1.jpg")
    img2_path = os.path.join(samples_dir, "sample-2.jpg")
    
    if not os.path.exists(img1_path):
        print("Sample 1 image not found!")
        return

    img1 = cv2.imread(img1_path)
    img2 = cv2.imread(img2_path) if os.path.exists(img2_path) else img1

    target_w, target_h = 960, 540
    fps = 24
    total_frames = 120 # 5 seconds
    
    raw_video_path = os.path.join(samples_dir, "temp_sample.mp4")
    final_video_path = os.path.join(samples_dir, "sample-traffic.mp4")

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(raw_video_path, fourcc, fps, (target_w, target_h))

    # Resize base images
    base1 = cv2.resize(img1, (target_w + 120, target_h + 80))
    base2 = cv2.resize(img2, (target_w + 120, target_h + 80))

    for i in range(total_frames):
        alpha = i / total_frames
        
        # Smooth camera pan and drift
        dx = int(60 * np.sin(np.pi * i / total_frames))
        dy = int(30 * (1 - np.cos(np.pi * i / total_frames)))
        
        if i < total_frames // 2:
            frame_crop = base1[dy:dy+target_h, dx:dx+target_w]
        else:
            blend_ratio = (i - total_frames // 2) / (total_frames // 2)
            crop1 = base1[dy:dy+target_h, dx:dx+target_w]
            crop2 = base2[dy:dy+target_h, dx:dx+target_w]
            frame_crop = cv2.addWeighted(crop1, 1 - blend_ratio, crop2, blend_ratio, 0)

        out.write(frame_crop)

    out.release()

    # Re-encode to standard web H.264
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [
        ffmpeg_exe, "-y",
        "-i", raw_video_path,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "ultrafast",
        "-movflags", "+faststart",
        final_video_path
    ]
    subprocess.run(cmd, check=True)
    if os.path.exists(raw_video_path):
        os.remove(raw_video_path)

    print(f"Generated sample-traffic.mp4 successfully! Size: {os.path.getsize(final_video_path)} bytes")

if __name__ == "__main__":
    create_sample_traffic_video()
