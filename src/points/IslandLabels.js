/**
 * IslandLabels — large text labels at topic centroids,
 * rendered behind the dot layer.
 *
 * Uses a hand-drawn / nautical style font. More visible when
 * zoomed out, fades when zoomed in. Each label is subtly colored
 * to match its topic's dot color.
 */

import { Container, Text, TextStyle } from 'pixi.js';

const GOLDEN_RATIO = 0.618033988749895;

function hslToHex(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q2;
    r = hue2rgb(p, q2, h + 1 / 3);
    g = hue2rgb(p, q2, h);
    b = hue2rgb(p, q2, h - 1 / 3);
  }
  const toHex = (v) => Math.round(v * 255);
  return (toHex(r) << 16) | (toHex(g) << 8) | toHex(b);
}

export class IslandLabels {
  /**
   * @param {Container} container - parent container
   * @param {Array} topics - [{name, x, y, count}]
   * @param {Map} topicIndexMap - topic name → index (for color)
   */
  constructor(container, topics, topicIndexMap) {
    this.labels = [];
    this.container = new Container();
    container.addChild(this.container);

    for (const topic of topics) {
      const idx = topicIndexMap.get(topic.name) ?? 0;
      const hue = (idx * GOLDEN_RATIO) % 1;
      // Desaturated, lighter version of the topic color for labels
      const color = hslToHex(hue, 0.35, 0.45);

      const style = new TextStyle({
        fontFamily: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
        fontSize: 90,
        fill: color,
        fontWeight: 'normal',
        fontStyle: 'italic',
        letterSpacing: 3,
      });

      const label = new Text({ text: topic.name, style });
      label.anchor.set(0.5, 0.5);
      label.x = topic.x;
      label.y = topic.y;
      label.alpha = 0.35;
      this.container.addChild(label);
      this.labels.push(label);
    }
  }

  /**
   * Adjust visibility based on zoom level.
   * More visible zoomed out, fades gently when zoomed in.
   */
  update(zoom) {
    // More visible when zoomed out: at 0.1 → 0.7, at 0.5 → 0.45, at 1.5 → 0.12
    const alpha = Math.max(0.10, Math.min(0.70, 0.75 - zoom * 0.45));
    for (const label of this.labels) {
      label.alpha = alpha;
    }
  }
}
