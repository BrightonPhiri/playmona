from pathlib import Path
from PIL import Image
import shutil

# The directory where this script is located
images_dir = Path(__file__).resolve().parent

# Folder for original PNG files
png_dir = images_dir / "png"
png_dir.mkdir(exist_ok=True)

# Find PNG files in the current images directory
png_files = list(images_dir.glob("*.png")) + list(images_dir.glob("*.PNG"))

if not png_files:
    print("No PNG images found.")
    exit()

print(f"Found {len(png_files)} PNG image(s).\n")

for png_file in png_files:
    webp_file = images_dir / f"{png_file.stem}.webp"

    try:
        # Open and convert PNG to WebP
        with Image.open(png_file) as img:
            img.save(webp_file, "WEBP", quality=85, method=6)

        # Move original PNG into png folder
        shutil.move(str(png_file), str(png_dir / png_file.name))

        print(f"✓ {png_file.name} → {webp_file.name}")

    except Exception as e:
        print(f"✗ Failed: {png_file.name}")
        print(f"  Error: {e}")

print("\nConversion complete.")