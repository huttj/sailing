/**
 * IslandLabels — large text labels at topic centroids,
 * rendered behind the dot layer.
 *
 * Uses a hand-drawn / nautical style font. More visible when
 * zoomed out, fades when zoomed in close.
 */

import { Container, Text, TextStyle } from 'pixi.js';

const LABEL_STYLE = new TextStyle({
  fontFamily: '"Homemade Apple", "Marker Felt", "Segoe Script", "Comic Sans MS", cursive',
  fontSize: 90,
  fill: 0x4a8ab5,
  fontWeight: 'normal',
  letterSpacing: 2,
});

export class IslandLabels {
  constructor(container, topics) {
    this.labels = [];
    this.container = new Container();
    container.addChild(this.container);

    for (const topic of topics) {
      const label = new Text({ text: topic.name, style: LABEL_STYLE });
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
    // At zoom 0.1 → alpha ~0.5, at zoom 0.5 → alpha ~0.35, at zoom 1.5 → alpha ~0.12
    const alpha = Math.max(0.08, Math.min(0.55, 0.55 - zoom * 0.3));
    for (const label of this.labels) {
      label.alpha = alpha;
    }
  }
}
