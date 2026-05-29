#!/usr/bin/env python3
"""Generate Helm DMG background (600x400) as on-brand SVG → PNG via rsvg-convert."""
import subprocess, pathlib, math

W, H = 600, 400

# Brand colors
ABYSS      = "#0A1628"
ICON_BG    = "#0e1e36"   # slightly lighter navy for icon fill
NAVY       = "#0c1a2f"
GOLD       = "#D4AF6A"
CHALK      = "#F7F4EF"
FOG        = "#C8C4BC"

def spoke_line(cx, cy, angle_deg, r_inner, r_outer, sw):
    a = math.radians(angle_deg)
    x1 = cx + r_inner * math.cos(a)
    y1 = cy + r_inner * math.sin(a)
    x2 = cx + r_outer * math.cos(a)
    y2 = cy + r_outer * math.sin(a)
    return f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" stroke="{GOLD}" stroke-width="{sw}" stroke-linecap="round"/>'

def knob(cx, cy, angle_deg, dist, r):
    a = math.radians(angle_deg)
    x = cx + dist * math.cos(a)
    y = cy + dist * math.sin(a)
    return f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{r}" fill="{GOLD}"/>'

def wheel_svg(cx, cy, s):
    parts = []
    # Rim
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="{38*s:.2f}" fill="none" stroke="{GOLD}" stroke-width="{3.8*s:.2f}"/>')
    # 4 cardinal knobs
    for angle in [270, 90, 180, 0]:
        parts.append(knob(cx, cy, angle, 44*s, 6.5*s))
    # 4 diagonal knobs
    for angle in [315, 45, 225, 135]:
        parts.append(knob(cx, cy, angle, 39*s, 5.5*s))
    # Spokes
    for angle in [270, 90, 180, 0, 315, 45, 225, 135]:
        parts.append(spoke_line(cx, cy, angle, 9*s, 38*s, 3.2*s))
    # Hub ring
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="{9*s:.2f}" fill="{ICON_BG}" stroke="{GOLD}" stroke-width="{3.2*s:.2f}"/>')
    # Hub dot
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="{3.5*s:.2f}" fill="{GOLD}"/>')
    return "\n  ".join(parts)

def app_icon(cx, cy, size, wheel_scale):
    """Render a macOS-style rounded-square app icon containing the wheel."""
    half = size / 2
    x = cx - half
    y = cy - half
    # macOS rounded rect: corner radius ≈ 22.5% of size
    r = size * 0.225
    return f"""
  <!-- macOS rounded-square icon container -->
  <rect x="{x:.1f}" y="{y:.1f}" width="{size}" height="{size}" rx="{r:.1f}" ry="{r:.1f}"
        fill="{ICON_BG}" stroke="rgba(212,175,106,0.18)" stroke-width="1"/>
  <!-- Subtle inner gradient overlay -->
  <rect x="{x:.1f}" y="{y:.1f}" width="{size}" height="{size}" rx="{r:.1f}" ry="{r:.1f}"
        fill="url(#icon-grad)"/>
  <!-- Wheel -->
  {wheel_svg(cx, cy, wheel_scale)}"""

def dot_grid(w, h, spacing=24):
    dots = []
    for x in range(0, w, spacing):
        for y in range(0, h, spacing):
            dots.append(f'<circle cx="{x}" cy="{y}" r="0.7" fill="{CHALK}" opacity="0.04"/>')
    return "\n  ".join(dots)

# Right-half icon: centred at 73% x, 44% y
icon_cx    = W * 0.73
icon_cy    = H * 0.44
icon_size  = 148          # px — roughly matches real app icon visual weight
wheel_s    = icon_size / 2 / 44  # scale so knobs reach edge of icon

svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="{NAVY}"/>
      <stop offset="100%" stop-color="{ABYSS}"/>
    </linearGradient>
    <linearGradient id="icon-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="rgba(255,255,255,0.04)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.10)"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="{W}" height="{H}" fill="url(#bg)"/>

  <!-- Nautical dot grid -->
  {dot_grid(W, H)}

  <!-- Subtle vertical divider -->
  <line x1="{W//2}" y1="40" x2="{W//2}" y2="{H-40}"
        stroke="{CHALK}" stroke-width="0.5" opacity="0.07"/>

  <!-- Left zone: drag label -->
  <text x="{W*0.25:.0f}" y="{H*0.84:.0f}" text-anchor="middle"
        font-family="Inter, Helvetica Neue, sans-serif" font-size="11" font-weight="500"
        fill="{FOG}" opacity="0.65" letter-spacing="0.08em">DRAG TO APPLICATIONS</text>

  <!-- Right zone: app icon + wordmark -->
  {app_icon(icon_cx, icon_cy, icon_size, wheel_s)}

  <text x="{icon_cx:.0f}" y="{icon_cy + icon_size/2 + 22:.0f}" text-anchor="middle"
        font-family="Playfair Display, Georgia, serif" font-size="16" font-weight="700"
        fill="{GOLD}" opacity="0.85" letter-spacing="0.06em">Helm</text>
</svg>"""

svg_path = pathlib.Path("public/brand/dmg-background.svg")
png_path = pathlib.Path("public/brand/dmg-background.png")

svg_path.write_text(svg)
subprocess.run(["rsvg-convert", "-w", str(W), "-h", str(H), str(svg_path), "-o", str(png_path)], check=True)
svg_path.unlink()

print(f"dmg-background.png written ({png_path.stat().st_size // 1024} KB)")
