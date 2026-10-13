"""Original end-card and fictional paper prop; no external imagery."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artwork'
OUT.mkdir(exist_ok=True)
SERIF = '/usr/share/fonts/truetype/noto/NotoSerifDisplay-Regular.ttf'
SANS = '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf'
MONO = '/usr/share/fonts/truetype/noto/NotoSansMono-Regular.ttf'
def centered(draw, text, y, font, fill):
    box = draw.textbbox((0,0), text, font=font)
    draw.text(((1920-(box[2]-box[0]))/2,y),text,font=font,fill=fill)
im = Image.new('RGB',(1920,1080),'#f3ecdc'); d=ImageDraw.Draw(im)
d.line((922,280,998,280),fill='#ba4b30',width=6)
centered(d,'OPENLINE',335,ImageFont.truetype(SERIF,166),'#303a33')
centered(d,'The AI can ignore STOP.',610,ImageFont.truetype(SANS,48),'#303a33')
centered(d,'The consequence can’t.',680,ImageFont.truetype(SANS,48),'#303a33')
im.save(OUT/'end-card.png')
im = Image.new('RGB',(1920,1080),'#66705a');d=ImageDraw.Draw(im)
d.rounded_rectangle((312,282,1626,820),radius=10,fill='#465042')
d.polygon([(284,236),(1615,260),(1590,799),(264,773)],fill='#f6f1e5')
d.line((356,428,1504,448),fill='#d6d1c5',width=2)
centered(d,'door.open — REFUSED',475,ImageFont.truetype(MONO,74),'#2f382e')
d.line((360,663,1482,683),fill='#d6d1c5',width=2)
im.save(OUT/'receipt.png')
print('Original receipt and end-card artwork saved')
