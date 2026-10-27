import sys
import json
import os
import cv2
import logging
import subprocess
import imageio_ffmpeg
from ultralytics import YOLO

# Suppress YOLO logs
logging.getLogger("ultralytics").setLevel(logging.ERROR)

def format_time(seconds):
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    millis = int((seconds - int(seconds)) * 10)
    return f"{mins:02d}:{secs:02d}.{millis:01d}"

def draw_hud(frame, current_count, unique_count, peak_count, time_sec):
    h, w = frame.shape[:2]
    
    # Semi-transparent HUD overlay in top-left
    hud_w = min(420, int(w * 0.75))
    hud_h = 75
    overlay = frame.copy()
    cv2.rectangle(overlay, (15, 15), (15 + hud_w, 15 + hud_h), (12, 17, 29), -1)
    cv2.rectangle(overlay, (15, 15), (15 + hud_w, 15 + hud_h), (0, 229, 255), 1)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)

    # Accent status dot
    cv2.circle(frame, (32, 35), 5, (0, 255, 128), -1)
    cv2.putText(frame, "FLOWVISION AI - TELEMETRY", (45, 39), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (220, 240, 255), 1, cv2.LINE_AA)
    
    # Metrics text
    text_metrics = f"Active: {current_count}  |  Peak: {peak_count}  |  Unique Total: {unique_count}"
    cv2.putText(frame, text_metrics, (30, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 229, 255), 1, cv2.LINE_AA)

    # Time display in top-right of HUD
    time_str = format_time(time_sec)
    cv2.putText(frame, f"T: {time_str}", (15 + hud_w - 95, 39), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (180, 200, 220), 1, cv2.LINE_AA)

def main():
    if len(sys.argv) < 3:
        print("Usage: python video_inference.py <input_video_path> <output_dir> [frame_stride]")
        sys.exit(1)

    input_path = sys.argv[1]
    output_dir = sys.argv[2]
    frame_stride = int(sys.argv[3]) if len(sys.argv) > 3 else 2
    if frame_stride < 1:
        frame_stride = 1

    try:
        if not os.path.exists(output_dir):
            os.makedirs(output_dir, exist_ok=True)

        cap = cv2.VideoCapture(input_path)
        if not cap.isOpened():
            raise Exception(f"Failed to open video file: {input_path}")

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        orig_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        duration_sec = total_frames / orig_fps if (orig_fps > 0 and total_frames > 0) else 0.0

        # Smart downscaling for 4K / 1080p high-res videos to prevent huge memory usage and CPU slow down
        max_dim = 1280
        scale = 1.0
        width, height = orig_w, orig_h
        if max(orig_w, orig_h) > max_dim:
            scale = max_dim / float(max(orig_w, orig_h))
            width = int(orig_w * scale)
            height = int(orig_h * scale)

        # H.264 codecs require even dimensions
        if width % 2 != 0:
            width -= 1
        if height % 2 != 0:
            height -= 1

        # Adaptive frame stride for large videos:
        # Keep total YOLO neural forward passes around 200-250 so inference completes in 20-30s
        if total_frames > 300:
            frame_stride = max(frame_stride, int(total_frames / 200))
            print(f"Adaptive frame stride set to {frame_stride} for {total_frames} frames", file=sys.stderr)

        model = YOLO('models/best.pt')

        raw_out_path = os.path.join(output_dir, 'raw_result.mp4')
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(raw_out_path, fourcc, orig_fps, (width, height))

        unique_tracks = {} # track_id -> class_name
        class_lifetime_counts = {}
        timeline = []
        
        peak_active = 0
        peak_timestamp = 0.0
        active_counts_history = []
        
        frame_idx = 0
        last_plotted_frame = None
        last_current_count = 0
        last_class_counts = {}

        # Log progress file so Express or frontend could optionally monitor
        progress_file = os.path.join(output_dir, 'progress.json')

        # Limit to first 900 frames (~30s of video) for rapid CPU feedback if video is very long
        max_process_frames = min(total_frames if total_frames > 0 else 900, 900)
        calc_total = max_process_frames

        while cap.isOpened() and frame_idx < max_process_frames:
            ret, frame = cap.read()
            if not ret:
                break

            # Resize if needed
            if scale < 1.0:
                frame = cv2.resize(frame, (width, height), interpolation=cv2.INTER_AREA)

            current_time_sec = round(frame_idx / orig_fps, 2)

            # Process with YOLO on sampled frames
            if frame_idx % frame_stride == 0 or last_plotted_frame is None:
                # Run YOLO tracking with ByteTrack (imgsz=640 for optimal speed/accuracy trade-off)
                results = model.track(frame, persist=True, tracker="bytetrack.yaml", imgsz=640, verbose=False)
                res = results[0]

                # Get plotted frame from YOLO
                plotted = res.plot()

                # Parse detection & tracking info
                boxes = res.boxes
                class_names = res.names
                
                current_count = len(boxes) if boxes is not None else 0
                frame_class_counts = {}

                if boxes is not None and len(boxes) > 0:
                    cls_tensor = boxes.cls.cpu().numpy()
                    id_tensor = boxes.id.int().cpu().numpy() if boxes.id is not None else None

                    for i, cls_id in enumerate(cls_tensor):
                        c_name = class_names[int(cls_id)]
                        frame_class_counts[c_name] = frame_class_counts.get(c_name, 0) + 1

                        if id_tensor is not None and i < len(id_tensor):
                            t_id = int(id_tensor[i])
                            if t_id not in unique_tracks:
                                unique_tracks[t_id] = c_name
                                class_lifetime_counts[c_name] = class_lifetime_counts.get(c_name, 0) + 1
                        else:
                            # Fallback if tracking ID is not assigned yet
                            class_lifetime_counts[c_name] = class_lifetime_counts.get(c_name, 0) + 1

                if current_count > peak_active:
                    peak_active = current_count
                    peak_timestamp = current_time_sec

                active_counts_history.append(current_count)
                last_current_count = current_count
                last_class_counts = frame_class_counts

                # Add HUD
                draw_hud(plotted, current_count, len(unique_tracks) or len(active_counts_history), peak_active, current_time_sec)
                last_plotted_frame = plotted

                # Record timeline sample every ~0.5s or on keyframes
                sample_interval = max(1, int(orig_fps / 2))
                if frame_idx % sample_interval == 0 or frame_idx == max_process_frames - 1:
                    timeline.append({
                        "timeSec": current_time_sec,
                        "frameIndex": frame_idx,
                        "activeCount": current_count,
                        "classes": frame_class_counts
                    })
            else:
                # For skipped frames, reuse previous plotted frame with updated HUD timestamp
                plotted = last_plotted_frame.copy()
                draw_hud(plotted, last_current_count, len(unique_tracks) or len(active_counts_history), peak_active, current_time_sec)

            out.write(plotted)
            frame_idx += 1

            if frame_idx % 15 == 0 or frame_idx == max_process_frames:
                try:
                    with open(progress_file, 'w') as pf:
                        json.dump({
                            "framesDone": frame_idx,
                            "totalFrames": calc_total,
                            "percent": min(90, round((frame_idx / calc_total) * 90, 1)),
                            "status": f"Tracking vehicles (Frame {frame_idx}/{calc_total})..."
                        }, pf)
                except Exception:
                    pass

        cap.release()
        out.release()

        # Update progress for ffmpeg encoding
        try:
            with open(progress_file, 'w') as pf:
                json.dump({
                    "framesDone": frame_idx,
                    "totalFrames": calc_total,
                    "percent": 92,
                    "status": "Finalizing H.264 stream & telemetry..."
                }, pf)
        except Exception:
            pass

        # Re-encode to browser-optimized H.264 MP4 using imageio_ffmpeg
        final_video_path = os.path.join(output_dir, 'result.mp4')
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        
        ffmpeg_cmd = [
            ffmpeg_exe, "-y",
            "-i", raw_out_path,
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "ultrafast",
            "-crf", "23",
            "-movflags", "+faststart",
            final_video_path
        ]
        
        subprocess.run(ffmpeg_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # Clean up intermediate raw file
        if os.path.exists(raw_out_path):
            try:
                os.remove(raw_out_path)
            except Exception:
                pass

        total_unique = len(unique_tracks) if len(unique_tracks) > 0 else sum(class_lifetime_counts.values())
        avg_active = round(sum(active_counts_history) / len(active_counts_history), 2) if active_counts_history else 0
        flow_rate_per_min = round((total_unique / (duration_sec / 60)), 1) if duration_sec > 0 else 0

        # Class counts aggregation
        final_class_counts = class_lifetime_counts if class_lifetime_counts else last_class_counts

        telemetry_data = {
            "mediaType": "video",
            "summary": {
                "totalUniqueVehicles": total_unique,
                "peakActiveVehicles": peak_active,
                "peakTimestampSec": peak_timestamp,
                "averageActiveVehicles": avg_active,
                "totalFrames": total_frames,
                "processedFrames": frame_idx,
                "durationSec": round(duration_sec, 2),
                "fps": round(orig_fps, 2),
                "estimatedFlowRatePerMin": flow_rate_per_min
            },
            "counts": final_class_counts,
            "timeline": timeline
        }

        telemetry_file = os.path.join(output_dir, 'telemetry.json')
        with open(telemetry_file, 'w') as f:
            json.dump(telemetry_data, f, indent=2)

        # Also write counts.json for backwards compatibility with image consumer
        counts_file = os.path.join(output_dir, 'counts.json')
        with open(counts_file, 'w') as f:
            json.dump(final_class_counts, f, indent=2)

    except Exception as e:
        err_path = os.path.join(output_dir, 'error.txt')
        with open(err_path, 'w') as f:
            f.write(str(e))
        sys.exit(1)

if __name__ == "__main__":
    main()
