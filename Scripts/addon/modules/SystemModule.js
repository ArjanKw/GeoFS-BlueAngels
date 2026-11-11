  class SystemModule {
    registerMfdPages(mfdModule) {
      mfdModule.registerPage({
        title: 'SYS',
        leftButtons: [
          { key: 'FLAPS', label: 'FLAP', states: ['MAN', 'AUTO'], stateIndex: 0 },
          { key: 'NA', label: '', states: [''], stateIndex: 0 },
          { key: 'SPEEDBRAKE', label: 'SPLR', states: ['MAX', '25%', '50%', '75%'], stateIndex: 0 },
        ],
        rightButtons: [
          { key: 'REFUELING', label: 'FUEL', states: ['CLOSED', 'OPEN'], stateIndex: 0 },
          { key: 'NA2', label: '', states: [''], stateIndex: 0 },
          { key: 'CANOPY', label: 'CANOPY', states: ['CLOSED', 'OPEN'], stateIndex: 0 },
        ],
        lines: [],
        render: (renderer, renderContext) => {
          const ctx = renderContext?.ctx ?? renderer?.canvasAPI?.context;
          const w = renderContext?.w ?? renderer?.canvasAPI?.canvas?.width ?? 512;
          const h = renderContext?.h ?? renderer?.canvasAPI?.canvas?.height ?? 512;
          const color = renderContext?.color ?? '#00ff66';
          if (!ctx) return;

          F18HudModule.drawGearAndFlapIndicators(ctx, w, h, color, { target: 'mfd' });

                    ctx.save();
                    ctx.fillStyle = color;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'alphabetic';
                    ctx.font = `${Math.max(8, Math.round(h * 0.028))}px monospace`;
                    ctx.fillText('Created by NatriumFS', w / 2, h - Math.round(h * 0.07));
                    ctx.fillText('Credits to yicha.25 (壹茶) for targeting pod, combat module, missiles and ADI view.', w / 2, h - Math.round(h * 0.03), w * 0.96);
                    ctx.restore();        }
      });
      return true;
    }
  }
