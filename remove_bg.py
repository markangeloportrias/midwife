from PIL import Image

# Load the image
img_path = r'c:\xampp\htdocs\THESIS6\logo2.png'
img = Image.open(img_path)

# Convert to RGBA if not already
if img.mode != 'RGBA':
    img = img.convert('RGBA')

# Get image data
data = img.getdata()
new_data = []

# Remove light background (white and near-white colors)
for item in data:
    r, g, b = item[0], item[1], item[2]
    # If pixel is very light (white or near-white), make it transparent
    if r > 235 and g > 235 and b > 235:
        new_data.append((255, 255, 255, 0))  # Transparent
    else:
        new_data.append(item)

img.putdata(new_data)

# Save the result (overwrites original)
img.save(img_path)
print('✓ Background removed successfully from logo2.png')
