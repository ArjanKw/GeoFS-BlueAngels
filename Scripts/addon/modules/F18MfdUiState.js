  class F18MfdUiState {
    constructor(dependencies = {}, pageRegistry = []) {
      this.mapModule = dependencies.mapModule;
      this.weaponsModule = dependencies.weaponsModule;
      this.recorderModule = dependencies.recorderModule;
      this.pageIndex = 0;
      this.pendingMfdExport = null;
      this.pages = pageRegistry;
      this.ensureDefaultsInStorage();
    }

    queueMfdExport(pageTitle = 'MFD') {
      this.pendingMfdExport = pageTitle;
    }

    exportMfdCanvasToPng(canvas, pageTitle = 'MFD') {
      const pad2 = (value) => `${value}`.padStart(2, '0');
      const now = new Date();
      const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
      const safeTitle = pageTitle.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'MFD';
      const filename = `${safeTitle}-MFD-${stamp}.png`;

      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = filename;
      link.click();
    }

    getCurrentPage() {
      return this.pages[this.pageIndex] ?? this.pages[0];
    }

    nextPage() {
      this.pageIndex = (this.pageIndex + 1) % this.pages.length;
    }

    prevPage() {
      this.pageIndex = (this.pageIndex - 1 + this.pages.length) % this.pages.length;
    }

    setPage(index) {
      if (index >= 0 && index < this.pages.length) {
        this.pageIndex = index;
      }
    }

    getButtonStorageKey(page, button, index, side) {
      const preferred = button?.key || button?.label || `${side}${index + 1}`;
      return OptionModule.buildOptionKey(page?.title ?? 'PAGE', preferred);
    }

    ensureDefaultsInStorage() {
      const stored = OptionModule.readOptions();
      let changed = false;

      for (let pageIndex = 0; pageIndex < this.pages.length; pageIndex++) {
        const page = this.pages[pageIndex];
        if (!page) continue;

        for (let i = 0; i < (page.leftButtons?.length ?? 0); i++) {
          const btn = page.leftButtons[i];
          if (!btn || !btn.states?.length) continue;
          const optionKey = this.getButtonStorageKey(page, btn, i, 'L');
          if (stored[optionKey] == null) {
            stored[optionKey] = btn.states[btn.stateIndex] ?? btn.states[0];
            changed = true;
          }
        }

        for (let i = 0; i < (page.rightButtons?.length ?? 0); i++) {
          const btn = page.rightButtons[i];
          if (!btn || !btn.states?.length) continue;
          const optionKey = this.getButtonStorageKey(page, btn, i, 'R');
          if (stored[optionKey] == null) {
            stored[optionKey] = btn.states[btn.stateIndex] ?? btn.states[0];
            changed = true;
          }
        }
      }

      if (changed) {
        OptionModule.writeOptions(stored);
      }
    }

    getStoredStateIndex(page, button, index, side) {
      if (!button?.states?.length) return -1;

      const optionKey = this.getButtonStorageKey(page, button, index, side);
      const storedState = OptionModule.readOptions()?.[optionKey];

      if (storedState != null) {
        const exactIndex = button.states.findIndex((s) => s === storedState);
        if (exactIndex >= 0) return exactIndex;
      }

      if (Number.isInteger(button.stateIndex) && button.stateIndex >= 0 && button.stateIndex < button.states.length) {
        return button.stateIndex;
      }

      return 0;
    }

    toggleButton(side, index) {
      const page = this.getCurrentPage();
      const list = side === 'left' ? page.leftButtons : page.rightButtons;
      const btn = list?.[index];
      if (!btn || !btn.states?.length) return;

      const currentIndex = this.getStoredStateIndex(page, btn, index, side === 'left' ? 'L' : 'R');
      const nextIndex = (currentIndex + 1) % btn.states.length;
      const nextState = btn.states[nextIndex] ?? btn.states[0];

      if (typeof btn.onClick === 'function') {
        btn.onClick({
          page,
          side,
          index,
          button: btn,
          uiState: this,
          currentIndex,
          nextIndex,
          nextState
        });
      }

      if (btn.managedExternally) {
        return;
      }

      btn.stateIndex = nextIndex;
      OptionModule.setOption(page?.title ?? 'PAGE', btn?.key || btn?.label || `${side}${index + 1}`, nextState);
    }

    isButtonVisible(button, page) {
      if (!button) return false;
      if (typeof button.show !== 'function') return true;
      return Boolean(button.show({ page, button, uiState: this }));
    }

    getVisibleButtonEntries(side, page = this.getCurrentPage()) {
      const list = side === 'left' ? page?.leftButtons : page?.rightButtons;
      if (!Array.isArray(list)) return [];

      const entries = [];
      for (let i = 0; i < list.length; i++) {
        const button = list[i];
        if (this.isButtonVisible(button, page)) {
          entries.push({ button, actualIndex: i });
        }
      }
      return entries;
    }

    getCombinedButtonGroups(side, page = this.getCurrentPage()) {
      const visibleEntries = this.getVisibleButtonEntries(side, page);
      if (!visibleEntries.length) return [];

      const groups = [];
      let i = 0;
      while (i < visibleEntries.length) {
        const start = i;
        const key = visibleEntries[i]?.button?.key;
        i += 1;

        while (i < visibleEntries.length && visibleEntries[i]?.button?.key === key) {
          i += 1;
        }

        if (key && (i - start) >= 2) {
          groups.push({
            key,
            startSlot: start,
            endSlot: i - 1,
            entries: visibleEntries.slice(start, i)
          });
        }
      }

      return groups;
    }

    getCombinedGroupForSlot(side, slotIndex, page = this.getCurrentPage()) {
      const groups = this.getCombinedButtonGroups(side, page);
      return groups.find((group) => slotIndex >= group.startSlot && slotIndex <= group.endSlot) ?? null;
    }

    toggleButtonBySlot(side, slotIndex) {
      const page = this.getCurrentPage();
      const visibleEntries = this.getVisibleButtonEntries(side, page);
      const entry = visibleEntries?.[slotIndex];
      if (!entry) return;
      this.toggleButton(side, entry.actualIndex);
    }

    getStateLabel(button, page, actualIndex, side) {
      if (page?.title === 'REC') {
        const status = this.recorderModule?.getFlightRecorderMfdStatus?.() ?? {
          installed: false,
          compatible: false,
          recordingState: 'OFF',
          playbackState: 'STOPPED'
        };
        if (!status.compatible) {
          return 'UNAVAIL';
        }
        if (button?.key === 'STATE') {
          return status.recordingState;
        }
        if (button?.key === 'PLAYBACK') {
          if (button?.combinedAction) {
            return button?.states?.[0] ?? button?.label ?? 'N/A';
          }
          return status.playbackState;
        }
      }

      if (page?.title === 'WPN' && (button?.key === 'FIRE' || button?.key === 'JETTISON')) {
        const mode = OptionModule.getOption('WPN', 'MODE', 'NAV');
        const modeLoadout = this.weaponsModule?.getModeLoadout?.(mode);
        return this.weaponsModule?.getSelectedLoadDisplay?.(mode, modeLoadout) ?? 'N/A';
      }

      if (page?.title === 'NAV') {
        const abbreviateNavTrafficState = (value) => {
          const token = String(value ?? '').trim().toUpperCase();
          if (token === 'FRIEND') return 'FRND';
          if (token === 'CIVILIAN') return 'CIV';
          if (token === 'UNKNOWN') return 'UNKN';
          return token;
        };

        if (button?.key === 'MARK') {
          return abbreviateNavTrafficState(this.mapModule?.getSelectedTrafficMark?.() || '');
        }
        if (button?.key === 'SHOW') {
          return abbreviateNavTrafficState(this.mapModule?.getShowFilter?.());
        }
        if (button?.key === 'VIEW') {
          return this.mapModule?.getViewMode?.() ?? '';
        }
      }

      const sideToken = side === 'right' ? 'R' : 'L';
      const resolvedIndex = this.getStoredStateIndex(page, button, actualIndex, sideToken);
      return button?.states?.[resolvedIndex] ?? '';
    }

    getLayout(w, h) {
      const frame = {
        left: 0,
        top: 0,
        width: w,
        height: h
      };

      const maxTabButtons = 5;
      const tabY = frame.top + h * 0.022;
      const bottomTabY = frame.top + h * 0.92;
      const tabW = w * 0.14;
      const tabH = h * 0.06;
      const tabGap = w * 0.03;
      const topPages = this.pages.slice(0, maxTabButtons);
      const bottomPages = this.pages.slice(maxTabButtons, maxTabButtons * 2);
      const topTabCount = topPages.length;
      const bottomTabCount = bottomPages.length;
      const tabsTotalW = topTabCount * tabW + Math.max(0, topTabCount - 1) * tabGap;
      const tabStartX = frame.left + (frame.width - tabsTotalW) * 0.5;
      const bottomTabsTotalW = bottomTabCount * tabW + Math.max(0, bottomTabCount - 1) * tabGap;
      const bottomTabStartX = frame.left + (frame.width - bottomTabsTotalW) * 0.5;

      const topTabs = topPages.map((p, i) => ({
        index: i,
        title: p.title,
        x: tabStartX + i * (tabW + tabGap) - w * 0.012,
        y: tabY - h * 0.01,
        w: tabW + w * 0.024,
        h: tabH + h * 0.02
      }));

      const bottomTabs = bottomPages.map((p, i) => ({
        index: i + maxTabButtons,
        title: p.title,
        x: bottomTabStartX + i * (tabW + tabGap) - w * 0.012,
        y: bottomTabY - h * 0.01,
        w: tabW + w * 0.024,
        h: tabH + h * 0.02
      }));

      const leftButtons = [];
      const rightButtons = [];
      const rowStartY = frame.top + h * 0.14;
      const rowStep = h * 0.155 + 3;
      const rowH = h * 0.08;

      for (let i = 0; i < 5; i++) {
        const y = rowStartY + i * rowStep;
        leftButtons.push({ index: i, x: frame.left + w * 0.028, y, w: w * 0.40, h: rowH });
        rightButtons.push({ index: i, x: frame.left + frame.width - w * 0.428, y, w: w * 0.40, h: rowH });
      }

      return { frame, topTabs, bottomTabs, leftButtons, rightButtons };
    }

    handleLocalClick(nx, ny) {
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) return false;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return false;

      const w = 512;
      const h = 512;
      const x = nx * w;
      const y = ny * h;
      const page = this.getCurrentPage();
      const layout = this.getLayout(w, h);

      for (const tab of layout.topTabs) {
        if (x >= tab.x && x <= tab.x + tab.w && y >= tab.y && y <= tab.y + tab.h) {
          this.setPage(tab.index);
          return true;
        }
      }

      for (const tab of layout.bottomTabs) {
        if (x >= tab.x && x <= tab.x + tab.w && y >= tab.y && y <= tab.y + tab.h) {
          this.setPage(tab.index);
          return true;
        }
      }

      for (const slot of layout.leftButtons) {
        if (slot.index < this.getVisibleButtonEntries('left', page).length
          && x >= slot.x && x <= slot.x + slot.w
          && y >= slot.y && y <= slot.y + slot.h) {
          this.toggleButtonBySlot('left', slot.index);
          return true;
        }
      }

      for (const slot of layout.rightButtons) {
        if (slot.index < this.getVisibleButtonEntries('right', page).length
          && x >= slot.x && x <= slot.x + slot.w
          && y >= slot.y && y <= slot.y + slot.h) {
          this.toggleButtonBySlot('right', slot.index);
          return true;
        }
      }

      return false;
    }

    render(renderer) {
      const ctx = renderer.canvasAPI.context;
      const w = renderer.canvasAPI.canvas.width;
      const h = renderer.canvasAPI.canvas.height;
      const page = this.getCurrentPage();
      const layout = this.getLayout(w, h);
      const baseColor = OptionModule.getOptionValue('HUD', 'COLOR', '#00ff66');
      const color = MfdModule.applyBrightnessToHexColor(baseColor, MfdModule.getMfdBrightnessFactor());
      renderer.canvasAPI.clear();

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(layout.frame.left, layout.frame.top, layout.frame.width, layout.frame.height);

      // renderer.canvasAPI.clear();

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);

      ctx.restore();

      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.round(h * 0.045)}px monospace`;

      if (typeof page.render === 'function') {
        ctx.save();
        page.render(renderer, {
          ctx,
          w,
          h,
          page,
          layout,
          uiState: this,
          color
        });
        ctx.restore();
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.round(h * 0.045)}px monospace`;

      for (const tab of layout.topTabs) {
        ctx.fillText(tab.title, tab.x + tab.w / 2, tab.y + tab.h / 2);
        if (tab.index === this.pageIndex) {
          ctx.strokeRect(tab.x - 4, tab.y - 2, tab.w + 8, tab.h + 4);
        }
      }

      for (const tab of layout.bottomTabs) {
        ctx.fillText(tab.title, tab.x + tab.w / 2, tab.y + tab.h / 2);
        if (tab.index === this.pageIndex) {
          ctx.strokeRect(tab.x - 4, tab.y - 2, tab.w + 8, tab.h + 4);
        }
      }

      ctx.textAlign = 'left';
      ctx.font = `bold ${Math.round(h * 0.045)}px monospace`;

      const visibleLeftButtons = this.getVisibleButtonEntries('left', page);
      const visibleRightButtons = this.getVisibleButtonEntries('right', page);

      const drawStackedLabel = (text, centerX, centerY, stepPx) => {
        const chars = String(text ?? '').split('');
        const totalHeight = Math.max(0, (chars.length - 1) * stepPx);
        const startY = centerY - totalHeight * 0.5;
        for (let c = 0; c < chars.length; c++) {
          ctx.fillText(chars[c], centerX, startY + c * stepPx);
        }
      };

      for (let i = 0; i < visibleLeftButtons.length && i < layout.leftButtons.length; i++) {
        const slot = layout.leftButtons[i];
        const combinedGroup = this.getCombinedGroupForSlot('left', i, page);
        if (combinedGroup) {
          const btn = visibleLeftButtons[i].button;
          const isMinimalGroup = Boolean(combinedGroup.entries?.[0]?.button?.minimal);
          if (isMinimalGroup) {
            const rowCenterY = slot.y + slot.h * 0.55;
            const labelX = slot.x + w * 0.016;
            ctx.save();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(btn?.label ?? ''), labelX, rowCenterY);
            ctx.restore();
            continue;
          }

          const actionText = btn?.states?.[0] ?? btn?.label ?? '';
          const rowCenterY = slot.y + slot.h * 0.55;
          const actionX = slot.x + w * 0.016;

          ctx.save();
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${actionText}`, actionX, rowCenterY);
          ctx.restore();
          continue;
        }

        const btn = visibleLeftButtons[i].button;
        const label = btn.label;
        const state = this.getStateLabel(btn, page, visibleLeftButtons[i].actualIndex, 'left');
        const rowCenterY = slot.y + slot.h * 0.55;
        const labelX = slot.x + w * 0.016;
        const stateX = slot.x + w * 0.060;
        const labelStep = h * 0.038;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        drawStackedLabel(label, labelX, rowCenterY, labelStep);
        ctx.restore();

        ctx.fillText(`${state}`, stateX, rowCenterY);
      }

      for (let i = 0; i < visibleRightButtons.length && i < layout.rightButtons.length; i++) {
        const slot = layout.rightButtons[i];
        const combinedGroup = this.getCombinedGroupForSlot('right', i, page);
        if (combinedGroup) {
          const btn = visibleRightButtons[i].button;
          const isMinimalGroup = Boolean(combinedGroup.entries?.[0]?.button?.minimal);
          if (isMinimalGroup) {
            const rowCenterY = slot.y + slot.h * 0.55;
            const labelX = slot.x + slot.w - w * 0.016;
            ctx.save();
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(btn?.label ?? ''), labelX, rowCenterY);
            ctx.restore();
            continue;
          }

          const actionText = btn?.states?.[0] ?? btn?.label ?? '';
          const bracketX = slot.x + slot.w * 0.56;
          const actionX = bracketX + w * 0.026;
          ctx.fillText(`${actionText}`, actionX, slot.y + slot.h * 0.55);
          continue;
        }

        const btn = visibleRightButtons[i].button;
        const label = btn.label;
        const state = this.getStateLabel(btn, page, visibleRightButtons[i].actualIndex, 'right');
        const rowCenterY = slot.y + slot.h * 0.55;
        const labelX = slot.x + slot.w - w * 0.016;
        const labelStateGap = w * (0.060 - 0.016);
        const stateRightX = labelX - labelStateGap;
        const labelStep = h * 0.033;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        drawStackedLabel(label, labelX, rowCenterY, labelStep);
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${state}`, stateRightX, rowCenterY);
        ctx.restore();
      }

      const drawCombinedBracket = (side) => {
        const groups = this.getCombinedButtonGroups(side, page);
        const slots = side === 'left' ? layout.leftButtons : layout.rightButtons;
        if (!groups?.length || !slots?.length) return;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = Math.max(1.5, w * 0.0028);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.round(h * 0.038)}px monospace`;

        for (const group of groups) {
          const startSlot = slots[group.startSlot];
          const endSlot = slots[group.endSlot];
          if (!startSlot || !endSlot) continue;

          const isMinimalGroup = Boolean(group.entries?.[0]?.button?.minimal);
          if (isMinimalGroup) {
            const button = group.entries[0].button;
            const rawDisplayValue = (Array.isArray(button?.values) && button.values.length)
              ? OptionModule.getOptionValue(page?.title ?? 'PAGE', button?.key || button?.label || '', '')
              : this.getStateLabel(button, page, group.entries[0]?.actualIndex ?? 0, side);
            const hasDisplayValue = String(rawDisplayValue ?? '').trim().length > 0;
            const displayValue = hasDisplayValue
              ? rawDisplayValue
              : (button?.combinedGroupLabel ?? button?.key ?? '');

            const yTop = startSlot.y + startSlot.h * 0.22;
            const yBottom = endSlot.y + endSlot.h * 0.78;
            const yMid = (yTop + yBottom) * 0.5;
            const valueX = side === 'left'
              ? (startSlot.x + w * 0.016)
              : (startSlot.x + startSlot.w - w * 0.016);

            ctx.save();
            ctx.textAlign = side === 'left' ? 'left' : 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(displayValue ?? ''), valueX, yMid);
            ctx.restore();
            continue;
          }

          const groupLabel = group.entries?.[0]?.button?.combinedGroupLabel
            ?? group.entries?.[0]?.button?.key
            ?? '';

          const yTop = startSlot.y + startSlot.h * 0.22;
          const yBottom = endSlot.y + endSlot.h * 0.78;
          const yMid = (yTop + yBottom) * 0.5;

          const bracketX = side === 'left'
            ? (startSlot.x + startSlot.w * 0.38)
            : (startSlot.x + startSlot.w * 0.56);
          const bracketArm = w * 0.012;
          const labelOffset = w * 0.048;

          ctx.beginPath();
          if (side === 'left') {
            // Left side should point left: ']'
            ctx.moveTo(bracketX - bracketArm, yTop);
            ctx.lineTo(bracketX, yTop);
            ctx.lineTo(bracketX, yBottom);
            ctx.lineTo(bracketX - bracketArm, yBottom);
          } else {
            // Right side keeps mirrored style.
            ctx.moveTo(bracketX + bracketArm, yTop);
            ctx.lineTo(bracketX, yTop);
            ctx.lineTo(bracketX, yBottom);
            ctx.lineTo(bracketX + bracketArm, yBottom);
          }
          ctx.stroke();

          const labelX = side === 'left'
            ? (bracketX + labelOffset)
            : (bracketX - labelOffset);
          const labelChars = String(groupLabel ?? '').split('');
          const lineStep = h * 0.038;
          const totalHeight = Math.max(0, (labelChars.length - 1) * lineStep);
          const startY = yMid - totalHeight * 0.5;

          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          for (let c = 0; c < labelChars.length; c++) {
            ctx.fillText(labelChars[c], labelX, startY + c * lineStep);
          }
          ctx.restore();
        }

        ctx.restore();
      };

      drawCombinedBracket('left');
      drawCombinedBracket('right');

      if (Array.isArray(page.lines) && page.lines.length) {
        ctx.textAlign = 'center';
        ctx.font = `bold ${Math.round(h * 0.05)}px monospace`;
        page.lines.forEach((line, i) => {
          ctx.fillText(line, w * 0.5, h * (0.72 + i * 0.07));
        });
      }

      if (this.pendingMfdExport !== null) {
        const request = this.pendingMfdExport;
        this.pendingMfdExport = null;
        this.exportMfdCanvasToPng(renderer.canvasAPI.canvas, request || page.title);
      }
    }
  }
