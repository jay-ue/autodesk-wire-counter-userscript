// ==UserScript==
// @name         Autodesk Viewer Wire Counter
// @namespace    codex.local
// @version      0.7.3
// @description  Click conduits/pipes in viewer.autodesk.com, assign circuit and wire settings, then export a report.
// @match        https://viewer.autodesk.com/*
// @updateURL    https://raw.githubusercontent.com/jay-ue/autodesk-wire-counter-userscript/main/autodesk-wire-counter.user.js
// @downloadURL  https://raw.githubusercontent.com/jay-ue/autodesk-wire-counter-userscript/main/autodesk-wire-counter.user.js
// @run-at       document-start
// @grant        unsafeWindow
// ==/UserScript==

/* global unsafeWindow */

;(() => {
  'use strict'

  const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  const DEFAULT_PANEL_WIDTH = 860
  const DEFAULT_PANEL_TOP = 88
  const DEFAULT_WIRE_MODEL = 'BV-2.5'
  const DEFAULT_WIRE_COUNT = 3
  const SCRIPT_VERSION = '0.7.3'
  const WIRE_HOVER_PIXEL_RADIUS = 3
  const MIN_PHYSICAL_PIPE_THICKNESS_METERS = 0.003

  const TEXT = {
    title: '\u7ebf\u7ba1\u7edf\u8ba1\u9762\u677f',
    subtitle:
      '\u5728 Autodesk Viewer \u91cc\u70b9\u51fb\u7ebf\u7ba1/\u6865\u67b6\u540e\uff0c\u8fd9\u91cc\u4f1a\u81ea\u52a8\u8bb0\u5f55\u957f\u5ea6\uff0c\u53ef\u4ee5\u8bbe\u7f6e\u56de\u8def\u3001\u5bfc\u7ebf\u578b\u53f7\u548c\u7ebf\u6570\u3002',
    dragHint:
      '\u6309\u4f4f\u8fd9\u91cc\u53ef\u62d6\u52a8\u9762\u677f\uff0c\u62d6\u52a8\u53f3\u4e0b\u89d2\u53ef\u8c03\u6574\u5927\u5c0f',
    waitingViewer: '\u7b49\u5f85 Viewer \u521d\u59cb\u5316...',
    viewerReady:
      'Viewer attached. \u73b0\u5728\u76f4\u63a5\u70b9\u51fb\u7ebf\u7ba1\u5373\u53ef\u8bb0\u5f55\u3002',
    waitingSelection: '\u5f53\u524d\u6ca1\u6709\u9009\u4e2d\u5bf9\u8c61\u3002',
    cleared: '\u5df2\u6e05\u7a7a\u5f53\u524d\u7edf\u8ba1\u3002',
    notPipePrefix: '\u5df2\u8df3\u8fc7\u975e\u7ebf\u7ba1\u5bf9\u8c61\uff1a',
    recordedPrefix: '\u5df2\u8bb0\u5f55\uff1a',
    viewerMissing: 'Viewer not attached yet.',
    exportButton: '\u5bfc\u51fa CSV',
    exportProjectButton: '\u5bfc\u51fa\u9879\u76ee',
    importProjectButton: '\u5bfc\u5165\u9879\u76ee',
    captureButton: '\u8bb0\u5f55\u5f53\u524d\u9009\u62e9',
    clearButton: '\u6e05\u7a7a',
    deleteButton: '\u5220\u9664',
    totalPipeLabel: '\u7ba1\u957f\u603b\u8ba1',
    totalWireLabel: '\u7535\u7ebf\u603b\u91cf',
    unnamed: '\u672a\u547d\u540d',
    unnamedCircuit: '\u672a\u5206\u914d',
  }

  const PIPE_KEYWORDS = [
    '\u7ba1',
    '\u7ebf\u7ba1',
    '\u5bfc\u7ba1',
    '\u6865\u67b6',
    'conduit',
    'cable tray',
    'tray',
    'pipe',
    'carrier',
    'segment',
  ]

  const NON_PHYSICAL_LINE_KEYWORDS = [
    '\u4e2d\u5fc3\u7ebf',
    '\u6a21\u578b\u7ebf',
    '\u8be6\u56fe\u7ebf',
    '\u53c2\u7167\u7ebf',
    '\u8f74\u7ebf',
    '\u8def\u5f84\u7ebf',
    '\u8f6e\u5ed3\u7ebf',
    '\u7ebf\u6bb5',
    '\u591a\u6bb5\u7ebf',
    '\u6837\u6761\u66f2\u7ebf',
    'centerline',
    'center line',
    'model line',
    'detail line',
    'symbolic line',
    'reference line',
    'polyline',
    'spline',
    'sketch',
  ]

  const LENGTH_KEYS = [
    '\u957f\u5ea6',
    '\u4e2d\u5fc3\u7ebf\u957f\u5ea6',
    '\u7ebf\u957f',
    'length',
    'curve length',
    'centerline length',
    'overall length',
  ]

  const IDENTIFIER_KEYS = [
    '\u7f16\u53f7',
    '\u6807\u8bb0',
    'element id',
    'id',
    'mark',
    'reference',
    'type mark',
  ]

  const LEVEL_KEYS = ['\u6807\u9ad8', '\u697c\u5c42', 'level', 'storey']
  const MODEL_KEYS = ['\u578b\u53f7', 'type name', 'family and type', 'type']
  const SIZE_KEYS = [
    '\u5c3a\u5bf8',
    '\u89c4\u683c',
    '\u516c\u79f0\u76f4\u5f84',
    '\u516c\u79f0\u534a\u5f84',
    '\u7ba1\u4ef6\u5916\u5f84',
    '\u76f4\u5f84',
    '\u534a\u5f84',
    'size',
    'diameter',
    'nominal diameter',
    'trade size',
  ]

  const state = {
    viewer: null,
    panel: null,
    miniEl: null,
    headEl: null,
    hoverTooltipEl: null,
    statusEl: null,
    summaryEl: null,
    totalsEl: null,
    tbodyEl: null,
    currentCircuitCode: '',
    currentCircuitName: '',
    defaultWireModel: DEFAULT_WIRE_MODEL,
    defaultWireCount: DEFAULT_WIRE_COUNT,
    panelPosition: null,
    panelSize: null,
    isMinimized: false,
    activeRowKey: '',
    dragRowKey: '',
    pendingCaptureKeys: new Set(),
    persistTimer: 0,
    suppressSelectionCaptureUntil: 0,
    rows: new Map(),
    collapsedCircuits: new Set(),
    attachedViewerIds: new WeakSet(),
  }

  function getStorageKey() {
    return `autodesk-wire-counter:${pageWindow.location.pathname}${pageWindow.location.search}`
  }

  function getProjectSnapshot() {
    return {
      schema: 'autodesk-wire-counter-project',
      version: '1.0',
      savedAt: new Date().toISOString(),
      sourceUrl: pageWindow.location.href,
      currentCircuitCode: state.currentCircuitCode,
      currentCircuitName: state.currentCircuitName,
      defaultWireModel: state.defaultWireModel,
      defaultWireCount: state.defaultWireCount,
      panelPosition: state.panelPosition,
      panelSize: state.panelSize,
      isMinimized: state.isMinimized,
      collapsedCircuits: Array.from(state.collapsedCircuits),
      rows: Array.from(state.rows.values()),
    }
  }

  function restoreProjectSnapshot(snapshot) {
    if (!snapshot || snapshot.schema !== 'autodesk-wire-counter-project') {
      throw new Error('Invalid wire counter project file.')
    }

    state.currentCircuitCode = normalizeText(snapshot.currentCircuitCode)
    state.currentCircuitName = normalizeText(snapshot.currentCircuitName)
    state.defaultWireModel = normalizeText(snapshot.defaultWireModel) || DEFAULT_WIRE_MODEL
    state.defaultWireCount = toNonNegativeNumber(snapshot.defaultWireCount, DEFAULT_WIRE_COUNT)
    state.panelPosition =
      snapshot.panelPosition &&
      Number.isFinite(snapshot.panelPosition.left) &&
      Number.isFinite(snapshot.panelPosition.top)
        ? snapshot.panelPosition
        : state.panelPosition
    state.panelSize =
      snapshot.panelSize &&
      Number.isFinite(snapshot.panelSize.width) &&
      Number.isFinite(snapshot.panelSize.height)
        ? snapshot.panelSize
        : state.panelSize
    state.isMinimized = Boolean(snapshot.isMinimized)
    state.collapsedCircuits = new Set(toArray(snapshot.collapsedCircuits).map(normalizeText))
    state.rows = new Map(
      toArray(snapshot.rows)
        .filter((row) => row && typeof row === 'object')
        .map((row, index) => normalizeRow(row, index))
        .map((row) => [row.key, row]),
    )
    removeDuplicateRecordedRows()
    normalizeAllRowOrder()
  }

  function toArray(value) {
    return Array.isArray(value) ? value : []
  }

  function normalizeText(value) {
    return String(value ?? '').trim()
  }

  function formatNumber(value) {
    return Number.isFinite(value) ? value.toFixed(2) : '0.00'
  }

  function toSafeNumber(value, fallback = 0) {
    const number = Number(value)
    return Number.isFinite(number) ? number : fallback
  }

  function toNonNegativeNumber(value, fallback = 0) {
    return Math.max(0, toSafeNumber(value, fallback))
  }

  function parseRowKey(key) {
    const text = normalizeText(key)
    const separatorIndex = text.lastIndexOf(':')
    if (separatorIndex <= 0) {
      return { modelId: '', dbId: null }
    }

    const dbId = Number(text.slice(separatorIndex + 1))
    return {
      modelId: text.slice(0, separatorIndex),
      dbId: Number.isInteger(dbId) ? dbId : null,
    }
  }

  function normalizeRow(row, index = 0) {
    const keyParts = parseRowKey(row.key)
    const modelId = normalizeText(row.modelId) || keyParts.modelId || 'default-model'
    const dbId = Math.trunc(toSafeNumber(row.dbId, keyParts.dbId ?? index + 1))
    const key = `${modelId}:${String(dbId)}`
    const lengthMeters = toNonNegativeNumber(row.lengthMeters)
    const wireCount = toNonNegativeNumber(row.wireCount, DEFAULT_WIRE_COUNT)
    const createdAt = toSafeNumber(row.createdAt, Date.now() + index)
    const orderIndex = Math.max(1, Math.trunc(toSafeNumber(row.orderIndex, index + 1)))

    return {
      ...row,
      key,
      modelId,
      dbId,
      createdAt,
      orderIndex,
      identifier: normalizeText(row.identifier) || String(dbId),
      name: normalizeText(row.name),
      customName: normalizeText(row.customName),
      level: normalizeText(row.level),
      pipeModel: normalizeText(row.pipeModel),
      pipeSize: normalizeText(row.pipeSize),
      lengthMeters,
      lengthSourceText: normalizeText(row.lengthSourceText),
      wireModel: normalizeText(row.wireModel) || DEFAULT_WIRE_MODEL,
      wireCount,
      circuitCode: normalizeText(row.circuitCode),
      circuitName: normalizeText(row.circuitName),
    }
  }

  function getDisplayName(row) {
    return normalizeText(row.customName) || normalizeText(row.name) || TEXT.unnamed
  }

  function getIdentifierDisplay(row) {
    const identifier = normalizeText(row.identifier) || '-'
    const dbId = Number.isInteger(Number(row.dbId)) ? String(row.dbId) : '-'
    return `${identifier} / dbId ${dbId}`
  }

  function setStatus(message) {
    if (state.statusEl) {
      state.statusEl.textContent = message
    }
  }

  function getDefaultPanelPosition() {
    const left = Math.max(pageWindow.innerWidth - DEFAULT_PANEL_WIDTH - 360, 16)
    return { left, top: DEFAULT_PANEL_TOP }
  }

  function getDefaultPanelSize() {
    return {
      width: Math.min(DEFAULT_PANEL_WIDTH, Math.max(560, pageWindow.innerWidth - 24)),
      height: Math.min(720, Math.max(420, pageWindow.innerHeight - 24)),
    }
  }

  function clampPanelSize(size) {
    const minWidth = 560
    const minHeight = 360
    const maxWidth = Math.max(minWidth, pageWindow.innerWidth - 16)
    const maxHeight = Math.max(minHeight, pageWindow.innerHeight - 16)

    return {
      width: Math.min(Math.max(Number(size?.width) || DEFAULT_PANEL_WIDTH, minWidth), maxWidth),
      height: Math.min(Math.max(Number(size?.height) || 620, minHeight), maxHeight),
    }
  }

  function clampPanelPosition(position) {
    const panel = state.panel
    const width = panel?.offsetWidth || DEFAULT_PANEL_WIDTH
    const height = panel?.offsetHeight || 520
    const minLeft = 8
    const minTop = 8
    const maxLeft = Math.max(minLeft, pageWindow.innerWidth - width - 8)
    const maxTop = Math.max(minTop, pageWindow.innerHeight - height - 8)

    return {
      left: Math.min(Math.max(position.left, minLeft), maxLeft),
      top: Math.min(Math.max(position.top, minTop), maxTop),
    }
  }

  function applyPanelPosition(position, persist = false) {
    if (!state.panel) {
      return
    }

    const nextPosition = clampPanelPosition(position)
    state.panel.style.left = `${nextPosition.left}px`
    state.panel.style.top = `${nextPosition.top}px`
    state.panel.style.right = 'auto'
    state.panelPosition = nextPosition
    positionMini()

    if (persist) {
      persistState()
    }
  }

  function applyPanelSize(size, persist = false) {
    if (!state.panel) {
      return
    }

    const nextSize = clampPanelSize(size)
    state.panel.style.width = `${nextSize.width}px`
    state.panel.style.height = `${nextSize.height}px`

    if (persist) {
      state.panelSize = nextSize
      persistState()
    }
  }

  function extractNumericValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }

    const text = normalizeText(value)
    if (!text) {
      return null
    }

    const match = text.match(/-?\d+(\.\d+)?/)
    if (!match) {
      return null
    }

    const numericValue = Number(match[0])
    return Number.isFinite(numericValue) ? numericValue : null
  }

  function getPropertyEntryText(property) {
    if (property && typeof property === 'object' && !Array.isArray(property)) {
      return normalizeText(
        property.displayValue ??
          property.displayNameValue ??
          property.value ??
          property.dbValue ??
          property.rawValue,
      )
    }

    return normalizeText(property)
  }

  function getPropertyEntryUnit(property) {
    if (!property || typeof property !== 'object' || Array.isArray(property)) {
      return ''
    }

    return [
      property.units,
      property.displayUnits,
      property.displayUnit,
      property.unit,
      property.unitName,
      property.unitsString,
      property.unitString,
      property.format,
    ]
      .map((value) => normalizeText(value).toLowerCase())
      .find(Boolean)
  }

  function getReadableUnitLabel(rawUnit) {
    const unit = normalizeText(rawUnit).toLowerCase()
    if (!unit) {
      return ''
    }

    if (unit.includes('millimeter') || unit.includes('mm') || unit.includes('\u6beb\u7c73')) {
      return 'mm'
    }

    if (unit.includes('centimeter') || unit.includes('cm') || unit.includes('\u5398\u7c73')) {
      return 'cm'
    }

    if (unit.includes('meter') || unit === 'm' || unit.includes('\u7c73')) {
      return 'm'
    }

    if (unit.includes('feet') || unit.includes('foot') || unit.includes('ft')) {
      return 'ft'
    }

    if (unit.includes('inch') || unit.includes('in.')) {
      return 'in'
    }

    return rawUnit
  }

  function buildPropertySourceText(property) {
    const valueText = getPropertyEntryText(property)
    const unitText = getReadableUnitLabel(getPropertyEntryUnit(property))

    if (valueText && unitText && !valueText.toLowerCase().includes(unitText)) {
      return `${valueText} ${unitText}`.trim()
    }

    return valueText
  }

  function buildLengthSourceText(property) {
    return buildPropertySourceText(property)
  }

  function parseLengthMeters(property) {
    const valueText = getPropertyEntryText(property)
    const numericValue = extractNumericValue(valueText || property)

    if (!Number.isFinite(numericValue)) {
      return null
    }

    const unitHint = `${buildLengthSourceText(property)} ${getPropertyEntryUnit(property)}`
      .toLowerCase()
      .replace(/\s+/g, ' ')

    if (
      unitHint.includes('mm') ||
      unitHint.includes('\u6beb\u7c73') ||
      unitHint.includes('\u516c\u5398')
    ) {
      return numericValue / 1000
    }

    if (
      unitHint.includes('cm') ||
      unitHint.includes('\u5398\u7c73') ||
      unitHint.includes('\u516c\u5206')
    ) {
      return numericValue / 100
    }

    if (
      unitHint.includes('ft') ||
      unitHint.includes('feet') ||
      unitHint.includes('foot') ||
      unitHint.includes('\u82f1\u5c3a')
    ) {
      return numericValue * 0.3048
    }

    if (
      unitHint.includes('inch') ||
      unitHint.includes('in.') ||
      unitHint.includes(' in') ||
      unitHint.startsWith('in ') ||
      unitHint.includes('\u82f1\u5bf8')
    ) {
      return numericValue * 0.0254
    }

    if (unitHint.includes(' m') || unitHint.endsWith('m') || unitHint.includes('\u7c73')) {
      return numericValue
    }

    return numericValue > 1000 ? numericValue / 1000 : numericValue
  }

  function getPropertyMap(properties) {
    const map = new Map()

    toArray(properties).forEach((property) => {
      const key = normalizeText(property.displayName).toLowerCase()
      if (key) {
        map.set(key, property)
      }
    })

    return map
  }

  function findPropertyValue(map, keys) {
    for (const key of keys) {
      const normalizedKey = key.toLowerCase()

      for (const [propName, propValue] of map.entries()) {
        if (propName.includes(normalizedKey)) {
          return propValue
        }
      }
    }

    return null
  }

  function looksLikePipe(propertyMap, fallbackName) {
    const haystack = [
      fallbackName,
      findPropertyValue(propertyMap, ['\u7c7b\u522b', 'category']),
      findPropertyValue(propertyMap, ['name']),
      findPropertyValue(propertyMap, ['\u65cf', 'family']),
      findPropertyValue(propertyMap, ['\u7c7b\u578b', 'type']),
    ]
      .map((value) => getPropertyEntryText(value).toLowerCase())
      .join(' ')

    return PIPE_KEYWORDS.some((keyword) => haystack.includes(keyword.toLowerCase()))
  }

  function looksLikeNonPhysicalLine(propertyMap, fallbackName) {
    const haystack = [
      fallbackName,
      findPropertyValue(propertyMap, ['\u7c7b\u522b', 'category']),
      findPropertyValue(propertyMap, ['name']),
      findPropertyValue(propertyMap, ['\u65cf', 'family']),
      findPropertyValue(propertyMap, ['\u7c7b\u578b', 'type']),
      findPropertyValue(propertyMap, ['subcategory', '\u5b50\u7c7b\u522b']),
    ]
      .map((value) => getPropertyEntryText(value).toLowerCase())
      .join(' ')

    return NON_PHYSICAL_LINE_KEYWORDS.some((keyword) => haystack.includes(keyword.toLowerCase()))
  }

  function getModelId(model) {
    return normalizeText(model?.id || model?.guid || 'default-model')
  }

  function getRowKey(model, dbId) {
    return `${getModelId(model)}:${String(dbId)}`
  }

  function findRowElement(rowKey) {
    return Array.from(document.querySelectorAll('[data-awc-row-key]')).find(
      (element) => element.dataset.awcRowKey === rowKey,
    )
  }

  function updateActiveRowClass() {
    document.querySelectorAll('[data-awc-row-key]').forEach((element) => {
      element.classList.toggle('awc-data-row-active', element.dataset.awcRowKey === state.activeRowKey)
    })
  }

  function scrollRowIntoView(rowKey) {
    const rowEl = findRowElement(rowKey)
    if (rowEl) {
      rowEl.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }

  function activateRow(row, scroll = true) {
    if (!row) {
      return
    }

    state.activeRowKey = row.key
    const circuitKey = getCircuitKey(row)
    if (state.collapsedCircuits.has(circuitKey)) {
      state.collapsedCircuits.delete(circuitKey)
      renderRows()
    } else {
      updateActiveRowClass()
    }

    if (scroll) {
      scrollRowIntoView(row.key)
    }
  }

  function findModelById(modelId) {
    const models =
      typeof state.viewer?.getAllModels === 'function'
        ? state.viewer.getAllModels()
        : [state.viewer?.model].filter(Boolean)
    const normalizedModelId = normalizeText(modelId)
    const exactModel = models.find((model) => getModelId(model) === normalizedModelId)

    if (exactModel) {
      return exactModel
    }

    return models.length === 1 ? models[0] : null
  }

  function focusRowModel(row) {
    if (!state.viewer || !row) {
      return
    }

    activateRow(row, false)

    const model = findModelById(row.modelId)
    const dbId = Number(row.dbId)

    if (!model) {
      setStatus(`无法定位模型：${normalizeText(row.identifier) || row.dbId}`)
      return
    }

    if (!Number.isInteger(dbId)) {
      setStatus(`无法定位构件：${normalizeText(row.identifier) || row.dbId}`)
      return
    }

    try {
      state.suppressSelectionCaptureUntil = Date.now() + 800
      state.viewer.select([dbId], model)
      if (typeof state.viewer.fitToView === 'function') {
        state.viewer.fitToView([dbId], model)
      }
      setStatus(`\u5df2\u5b9a\u4f4d\uff1a${normalizeText(row.identifier) || dbId}`)
    } catch (error) {
      console.warn('Failed to focus wire counter row', error)
      setStatus(`定位失败：${normalizeText(row.identifier) || dbId}`)
    }
  }

  function findRecordedRowForDbId(model, dbId) {
    if (!model || !Number.isInteger(dbId)) {
      return null
    }

    return state.rows.get(getRowKey(model, dbId)) || null
  }

  function removeDuplicateRecordedRows() {
    state.rows = new Map(Array.from(state.rows.values()).map((row) => [row.key, row]))
  }

  function persistStateNow() {
    if (state.persistTimer) {
      pageWindow.clearTimeout(state.persistTimer)
      state.persistTimer = 0
    }

    try {
      pageWindow.localStorage.setItem(getStorageKey(), JSON.stringify(getProjectSnapshot()))
    } catch (error) {
      console.warn('Failed to persist wire counter state', error)
    }
  }

  function persistState() {
    if (state.persistTimer) {
      return
    }

    state.persistTimer = pageWindow.setTimeout(() => {
      state.persistTimer = 0
      persistStateNow()
    }, 250)
  }

  function restoreState() {
    try {
      const raw = pageWindow.localStorage.getItem(getStorageKey())
      if (!raw) {
        return
      }

      restoreProjectSnapshot(JSON.parse(raw))
    } catch (error) {
      console.warn('Failed to restore wire counter state', error)
    }
  }

  function getTotalWireUsage() {
    return getSummaryStats().totalWireMeters
  }

  function getCircuitCode(row) {
    return normalizeText(row.circuitCode) || TEXT.unnamedCircuit
  }

  function getCircuitName(row) {
    return normalizeText(row.circuitName)
  }

  function getCircuitKey(row) {
    return getCircuitCode(row)
  }

  function getCircuitSortText(row) {
    return getCircuitCode(row)
  }

  function getRowSortValue(row) {
    return Number(row.orderIndex) || Number(row.createdAt) || Number(row.dbId) || 0
  }

  function buildCircuitGroups() {
    const summaryMap = new Map()

    for (const row of Array.from(state.rows.values()).sort((left, right) => {
      const circuitOrder = getCircuitSortText(left).localeCompare(getCircuitSortText(right), 'zh-CN')
      return circuitOrder || getRowSortValue(left) - getRowSortValue(right)
    })) {
      const key = getCircuitKey(row)
      const current =
        summaryMap.get(key) || {
          key,
          circuitCode: getCircuitCode(row),
          circuitName: getCircuitName(row),
          rows: [],
          pipeCount: 0,
          totalLengthMeters: 0,
          totalWireMeters: 0,
        }

      if (!current.circuitName && getCircuitName(row)) {
        current.circuitName = getCircuitName(row)
      }

      current.rows.push(row)
      current.pipeCount += 1
      current.totalLengthMeters += row.lengthMeters
      current.totalWireMeters += row.lengthMeters * row.wireCount
      summaryMap.set(key, current)
    }

    return Array.from(summaryMap.values())
  }

  function buildCircuitTotalsMap() {
    const summaryMap = new Map()

    for (const row of state.rows.values()) {
      const key = getCircuitKey(row)
      const current =
        summaryMap.get(key) || {
          key,
          circuitCode: getCircuitCode(row),
          circuitName: getCircuitName(row),
          pipeCount: 0,
          totalLengthMeters: 0,
          totalWireMeters: 0,
        }

      if (!current.circuitName && getCircuitName(row)) {
        current.circuitName = getCircuitName(row)
      }

      current.pipeCount += 1
      current.totalLengthMeters += row.lengthMeters
      current.totalWireMeters += row.lengthMeters * row.wireCount
      summaryMap.set(key, current)
    }

    return summaryMap
  }

  function getSummaryStats() {
    let totalLengthMeters = 0
    let totalWireMeters = 0
    let latestRow = null
    let latestSortValue = -Infinity
    const circuitKeys = new Set()

    for (const row of state.rows.values()) {
      const sortValue = getRowSortValue(row)

      totalLengthMeters += row.lengthMeters
      totalWireMeters += row.lengthMeters * row.wireCount
      circuitKeys.add(getCircuitKey(row))

      if (sortValue >= latestSortValue) {
        latestSortValue = sortValue
        latestRow = row
      }
    }

    return {
      circuitCount: circuitKeys.size,
      latestRow,
      totalLengthMeters,
      totalWireMeters,
    }
  }

  function normalizeAllRowOrder() {
    for (const group of buildCircuitGroups()) {
      group.rows.forEach((row, index) => {
        row.orderIndex = index + 1
      })
    }
  }

  function getNextOrderIndexForCircuit(circuitCode, circuitName) {
    const rowLike = { circuitCode, circuitName }
    const circuitKey = getCircuitKey(rowLike)
    const rows = Array.from(state.rows.values()).filter((row) => getCircuitKey(row) === circuitKey)
    return rows.reduce((max, row) => Math.max(max, Number(row.orderIndex) || 0), 0) + 1
  }

  function reorderRowsInCircuit(draggedKey, targetKey) {
    if (!draggedKey || !targetKey || draggedKey === targetKey) {
      return
    }

    const dragged = state.rows.get(draggedKey)
    const target = state.rows.get(targetKey)
    if (!dragged || !target) {
      return
    }

    if (getCircuitKey(dragged) !== getCircuitKey(target)) {
      setStatus('\u8bf7\u5728\u540c\u4e00\u56de\u8def\u5185\u62d6\u52a8\u8c03\u6574\u987a\u5e8f')
      return
    }

    const rows = Array.from(state.rows.values())
      .filter((row) => getCircuitKey(row) === getCircuitKey(target))
      .sort((left, right) => getRowSortValue(left) - getRowSortValue(right))
    const draggedIndex = rows.findIndex((row) => row.key === draggedKey)
    const targetIndex = rows.findIndex((row) => row.key === targetKey)

    if (draggedIndex < 0 || targetIndex < 0) {
      return
    }

    const [draggedRow] = rows.splice(draggedIndex, 1)
    rows.splice(targetIndex, 0, draggedRow)
    rows.forEach((row, index) => {
      row.orderIndex = index + 1
    })

    persistState()
    renderRows()
    activateRow(draggedRow)
  }

  function buildCircuitSummary() {
    return buildCircuitGroups().map((group) => ({
      circuitCode: group.circuitCode,
      circuitName: group.circuitName,
      pipeCount: group.pipeCount,
      totalLengthMeters: group.totalLengthMeters,
      totalWireMeters: group.totalWireMeters,
    }))
  }

  function refreshCircuitSummaryRows() {
    const groupMap = buildCircuitTotalsMap()

    document.querySelectorAll('[data-awc-circuit-total]').forEach((element) => {
      const group = groupMap.get(element.dataset.awcCircuitTotal)
      if (group) {
        element.textContent =
          `本回路合计：${group.pipeCount} 段，管长 ${formatNumber(group.totalLengthMeters)} m，` +
          `电线 ${formatNumber(group.totalWireMeters)} m`
      }
    })

    document.querySelectorAll('[data-awc-circuit-length]').forEach((element) => {
      const group = groupMap.get(element.dataset.awcCircuitLength)
      if (group) {
        element.textContent = formatNumber(group.totalLengthMeters)
      }
    })

    document.querySelectorAll('[data-awc-circuit-wire]').forEach((element) => {
      const group = groupMap.get(element.dataset.awcCircuitWire)
      if (group) {
        element.textContent = formatNumber(group.totalWireMeters)
      }
    })

    renderGrandTotals()
  }

  function renderGrandTotals(stats = getSummaryStats()) {
    if (!state.totalsEl) {
      return
    }

    const countEl = state.totalsEl.querySelector('[data-awc-total-count]')
    const lengthEl = state.totalsEl.querySelector('[data-awc-total-length]')
    const wireEl = state.totalsEl.querySelector('[data-awc-total-wire]')

    if (countEl) {
      countEl.textContent = `${state.rows.size} \u6bb5 / ${stats.circuitCount} \u56de\u8def`
    }

    if (lengthEl) {
      lengthEl.textContent = `${formatNumber(stats.totalLengthMeters)} m`
    }

    if (wireEl) {
      wireEl.textContent = `${formatNumber(stats.totalWireMeters)} m`
    }
  }

  function renderSummary() {
    if (!state.summaryEl) {
      return
    }

    const stats = getSummaryStats()

    state.summaryEl.textContent =
      `\u5df2\u8bb0\u5f55 ${state.rows.size} \u6761\uff0c\u56de\u8def ${stats.circuitCount} \u6761\uff0c` +
      `${TEXT.totalPipeLabel} ${formatNumber(stats.totalLengthMeters)} m\uff0c` +
      `${TEXT.totalWireLabel} ${formatNumber(stats.totalWireMeters)} m`
    renderGrandTotals(stats)
    updateMini(stats)
  }

  function getLatestRow() {
    return getSummaryStats().latestRow
  }

  function updateMini(stats = getSummaryStats()) {
    if (!state.miniEl) {
      return
    }

    const latest = stats.latestRow
    const latestText = latest
      ? `\u6700\u8fd1 ${normalizeText(latest.identifier) || latest.dbId} / ${formatNumber(latest.lengthMeters)} m`
      : '\u6682\u65e0\u7ebf\u7ba1'

    state.miniEl.querySelector('.awc-mini-title').textContent = '\u7ebf\u7ba1\u7edf\u8ba1'
    state.miniEl.querySelector('.awc-mini-summary').textContent =
      `${state.rows.size} \u6bb5 | \u7ba1 ${formatNumber(stats.totalLengthMeters)} m | \u7ebf ${formatNumber(stats.totalWireMeters)} m`
    state.miniEl.querySelector('.awc-mini-latest').textContent = latestText
  }

  function setMinimized(isMinimized, persist = true) {
    state.isMinimized = Boolean(isMinimized)

    if (state.panel) {
      state.panel.style.display = state.isMinimized ? 'none' : 'flex'
    }

    if (state.miniEl) {
      state.miniEl.style.display = state.isMinimized ? 'block' : 'none'
    }

    updateMini()

    if (persist) {
      persistState()
    }
  }

  function createInput(value, className = 'awc-input', type = 'text') {
    const input = document.createElement('input')
    input.className = className
    input.type = type
    input.value = value
    return input
  }

  function renderRows() {
    if (!state.tbodyEl) {
      return
    }

    state.tbodyEl.innerHTML = ''

    const makeCell = (content, className = '') => {
      const td = document.createElement('td')
      if (className) {
        td.className = className
      }

      if (content instanceof HTMLElement) {
        td.appendChild(content)
      } else {
        td.textContent = String(content)
      }

      return td
    }

    for (const group of buildCircuitGroups()) {
      const collapsed = state.collapsedCircuits.has(group.key)
      const groupRow = document.createElement('tr')
      groupRow.className = 'awc-circuit-row'

      const groupCell = document.createElement('td')
      groupCell.colSpan = 10

      const toggleButton = document.createElement('button')
      toggleButton.className = 'awc-circuit-toggle'
      toggleButton.type = 'button'
      toggleButton.textContent = collapsed ? '展开' : '折叠'
      toggleButton.addEventListener('click', () => {
        if (state.collapsedCircuits.has(group.key)) {
          state.collapsedCircuits.delete(group.key)
        } else {
          state.collapsedCircuits.add(group.key)
        }
        persistState()
        renderRows()
      })

      const groupTitle = document.createElement('span')
      groupTitle.className = 'awc-circuit-title'
      groupTitle.textContent = `回路 ${group.circuitCode}${group.circuitName ? ` / ${group.circuitName}` : ''}`

      const groupSummary = document.createElement('span')
      groupSummary.className = 'awc-circuit-inline-summary'
      groupSummary.dataset.awcCircuitTotal = group.key
      groupSummary.textContent =
        `本回路合计：${group.pipeCount} 段，管长 ${formatNumber(group.totalLengthMeters)} m，` +
        `电线 ${formatNumber(group.totalWireMeters)} m`

      groupCell.appendChild(toggleButton)
      groupCell.appendChild(groupTitle)
      groupCell.appendChild(groupSummary)
      groupRow.appendChild(groupCell)
      state.tbodyEl.appendChild(groupRow)

      if (collapsed) {
        continue
      }

      group.rows.forEach((row, rowIndex) => {
        const tr = document.createElement('tr')
        tr.className = 'awc-data-row'
        tr.dataset.awcRowKey = row.key
        tr.draggable = true
        tr.addEventListener('click', (event) => {
          const target = event.target
          if (target instanceof HTMLElement && target.closest('button, input, textarea, select, a')) {
            return
          }

          focusRowModel(row)
        })
        tr.addEventListener('dragstart', (event) => {
          const target = event.target
          if (target instanceof HTMLElement && target.closest('button, input, textarea, select, a')) {
            event.preventDefault()
            return
          }

          state.dragRowKey = row.key
          tr.classList.add('awc-data-row-dragging')
          event.dataTransfer?.setData('text/plain', row.key)
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move'
          }
        })
        tr.addEventListener('dragend', () => {
          state.dragRowKey = ''
          tr.classList.remove('awc-data-row-dragging')
        })
        tr.addEventListener('dragover', (event) => {
          if (!state.dragRowKey || state.dragRowKey === row.key) {
            return
          }

          event.preventDefault()
          tr.classList.add('awc-data-row-drop-target')
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move'
          }
        })
        tr.addEventListener('dragleave', () => {
          tr.classList.remove('awc-data-row-drop-target')
        })
        tr.addEventListener('drop', (event) => {
          event.preventDefault()
          tr.classList.remove('awc-data-row-drop-target')
          reorderRowsInCircuit(state.dragRowKey || event.dataTransfer?.getData('text/plain'), row.key)
          state.dragRowKey = ''
        })

        const circuitCodeInput = createInput(normalizeText(row.circuitCode))
        circuitCodeInput.addEventListener('input', () => {
          row.circuitCode = circuitCodeInput.value.trim()
          renderSummary()
          refreshCircuitSummaryRows()
          persistState()
        })
        circuitCodeInput.addEventListener('change', renderRows)

        const circuitNameInput = createInput(normalizeText(row.circuitName))
        circuitNameInput.addEventListener('input', () => {
          row.circuitName = circuitNameInput.value.trim()
          renderSummary()
          refreshCircuitSummaryRows()
          persistState()
        })
        circuitNameInput.addEventListener('change', renderRows)

        const wireModelInput = createInput(normalizeText(row.wireModel) || state.defaultWireModel)
        wireModelInput.addEventListener('input', () => {
          row.wireModel = wireModelInput.value.trim() || state.defaultWireModel
          persistState()
        })

        const wireCountInput = createInput(
          String(row.wireCount),
          'awc-input awc-input-number',
          'number',
        )
        wireCountInput.min = '0'

        const totalCell = document.createElement('td')
        totalCell.textContent = formatNumber(row.lengthMeters * row.wireCount)

        const lengthCellContent = document.createElement('span')
        lengthCellContent.textContent = formatNumber(row.lengthMeters)
        if (normalizeText(row.lengthSourceText)) {
          lengthCellContent.title = `原始长度：${normalizeText(row.lengthSourceText)}`
        }

        wireCountInput.addEventListener('input', () => {
          row.wireCount = Math.max(0, Number(wireCountInput.value) || 0)
          totalCell.textContent = formatNumber(row.lengthMeters * row.wireCount)
          renderSummary()
          refreshCircuitSummaryRows()
          persistState()
        })

        const removeButton = document.createElement('button')
        removeButton.textContent = TEXT.deleteButton
        removeButton.className = 'awc-button awc-button-danger'
        removeButton.addEventListener('click', () => {
          state.rows.delete(row.key)
          persistState()
          renderRows()
        })

        tr.appendChild(makeCell(rowIndex + 1, 'awc-serial-cell'))
        tr.appendChild(makeCell(circuitCodeInput))
        tr.appendChild(makeCell(circuitNameInput))
        tr.appendChild(makeCell(getIdentifierDisplay(row)))
        tr.appendChild(makeCell(normalizeText(row.pipeSize) || normalizeText(row.pipeModel) || '-'))
        tr.appendChild(makeCell(lengthCellContent))
        tr.appendChild(makeCell(wireModelInput))
        tr.appendChild(makeCell(wireCountInput))
        tr.appendChild(totalCell)
        tr.appendChild(makeCell(removeButton))
        state.tbodyEl.appendChild(tr)
      })

      const totalRow = document.createElement('tr')
      totalRow.className = 'awc-circuit-total-row'
      totalRow.appendChild(makeCell('本回路合计', 'awc-circuit-total-label'))
      totalRow.lastChild.colSpan = 5
      const lengthTotalCell = makeCell(formatNumber(group.totalLengthMeters))
      lengthTotalCell.dataset.awcCircuitLength = group.key
      totalRow.appendChild(lengthTotalCell)
      totalRow.appendChild(makeCell(''))
      totalRow.appendChild(makeCell(''))
      const wireTotalCell = makeCell(formatNumber(group.totalWireMeters))
      wireTotalCell.dataset.awcCircuitWire = group.key
      totalRow.appendChild(wireTotalCell)
      totalRow.appendChild(makeCell(''))
      state.tbodyEl.appendChild(totalRow)
    }

    renderSummary()
    updateActiveRowClass()
  }

  function exportCsv() {
    const detailHeader = [
      '\u5e8f\u53f7',
      '\u56de\u8def\u7f16\u53f7',
      '\u56de\u8def\u540d\u79f0',
      '\u5c5e\u6027ID',
      'Viewer dbId',
      '\u7ba1\u9053\u5c3a\u5bf8',
      '\u539f\u59cb\u540d\u79f0',
      '\u539f\u59cb\u957f\u5ea6',
      '\u957f\u5ea6(m)',
      '\u5bfc\u7ebf\u578b\u53f7',
      '\u7ebf\u6570',
      '\u7535\u7ebf\u91cf(m)',
      '\u697c\u5c42',
      '\u89c4\u683c',
    ]

    const detailRows = buildCircuitGroups().flatMap((group) =>
      group.rows.map((row, rowIndex) => [
        String(rowIndex + 1),
        normalizeText(row.circuitCode),
        normalizeText(row.circuitName),
        normalizeText(row.identifier),
        String(row.dbId),
        normalizeText(row.pipeSize),
        normalizeText(row.name),
        normalizeText(row.lengthSourceText),
        formatNumber(row.lengthMeters),
        normalizeText(row.wireModel),
        String(row.wireCount),
        formatNumber(row.lengthMeters * row.wireCount),
        normalizeText(row.level),
        normalizeText(row.pipeModel),
      ]),
    )

    const summaryRows = buildCircuitSummary().map((row) => [
      normalizeText(row.circuitCode),
      normalizeText(row.circuitName) || TEXT.unnamedCircuit,
      String(row.pipeCount),
      formatNumber(row.totalLengthMeters),
      formatNumber(row.totalWireMeters),
    ])
    const stats = getSummaryStats()

    const csvLines = [
      detailHeader,
      ...detailRows,
      [],
      ['\u56de\u8def\u6c47\u603b'],
      [
        '\u56de\u8def\u7f16\u53f7',
        '\u56de\u8def\u540d\u79f0',
        '\u7ba1\u9053\u6570',
        '\u603b\u7ba1\u957f(m)',
        '\u603b\u7535\u7ebf\u91cf(m)',
      ],
      ...summaryRows,
      [
        '\u603b\u8ba1',
        `${stats.circuitCount} \u4e2a\u56de\u8def`,
        String(state.rows.size),
        formatNumber(stats.totalLengthMeters),
        formatNumber(stats.totalWireMeters),
      ],
    ]
    const csv = csvLines
      .map((line) =>
        line.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','),
      )
      .join('\r\n')

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)

    anchor.href = url
    anchor.download = `autodesk-wire-report_${stamp}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function downloadTextFile(fileName, text, type) {
    const blob = new Blob([text], { type })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function exportProject() {
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)
    downloadTextFile(
      `autodesk-wire-project_${stamp}.json`,
      JSON.stringify(getProjectSnapshot(), null, 2),
      'application/json;charset=utf-8;',
    )
  }

  function importProjectFile(file) {
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.addEventListener('load', () => {
      try {
        restoreProjectSnapshot(JSON.parse(String(reader.result || '{}')))
        persistState()
        applyPanelSize(state.panelSize || getDefaultPanelSize(), false)
        applyPanelPosition(state.panelPosition || getDefaultPanelPosition(), false)
        renderRows()
        setMinimized(state.isMinimized, false)
        setStatus(`\u5df2\u5bfc\u5165\u9879\u76ee\uff1a${file.name}`)
      } catch (error) {
        console.warn('Failed to import wire counter project', error)
        setStatus(`\u9879\u76ee\u5bfc\u5165\u5931\u8d25\uff1a${file.name}`)
      }
    })
    reader.readAsText(file, 'utf-8')
  }

  function openProjectImportPicker() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.addEventListener('change', () => {
      importProjectFile(input.files?.[0])
    })
    input.click()
  }

  function installStyle() {
    if (document.getElementById('autodesk-wire-counter-style')) {
      return
    }

    const style = document.createElement('style')
    style.id = 'autodesk-wire-counter-style'
    style.textContent = `
      .awc-panel {
        position: fixed;
        z-index: 2147483647;
        width: min(${DEFAULT_PANEL_WIDTH}px, calc(100vw - 24px));
        height: min(720px, calc(100vh - 24px));
        min-width: 560px;
        min-height: 360px;
        max-width: calc(100vw - 16px);
        max-height: calc(100vh - 16px);
        display: flex;
        flex-direction: column;
        resize: both;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.97);
        box-shadow: 0 12px 36px rgba(15, 23, 42, 0.24);
        border: 1px solid rgba(148, 163, 184, 0.3);
        overflow: hidden;
        font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
        color: #10212a;
      }
      .awc-panel-dragging { opacity: 0.94; }
      .awc-head {
        padding: 14px 16px 10px;
        border-bottom: 1px solid rgba(226, 232, 240, 0.9);
        background: linear-gradient(135deg, #fff7ed, #ffffff);
        cursor: move;
        user-select: none;
      }
      .awc-head-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .awc-title {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin: 0;
        font-size: 18px;
        font-weight: 700;
      }
      .awc-version-badge {
        display: inline-flex;
        align-items: center;
        height: 20px;
        padding: 0 7px;
        border-radius: 999px;
        background: #e0f2fe;
        color: #075985;
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
      }
      .awc-minimize-button {
        flex: 0 0 auto;
        border: 0;
        border-radius: 8px;
        padding: 6px 10px;
        background: #e2e8f0;
        color: #10212a;
        cursor: pointer;
        font-size: 12px;
      }
      .awc-subtitle, .awc-summary, .awc-status, .awc-drag-hint {
        margin-top: 8px;
        font-size: 13px;
        line-height: 1.5;
      }
      .awc-drag-hint { color: #64748b; }
      .awc-toolbar {
        display: grid;
        grid-template-columns: minmax(120px, 0.9fr) minmax(160px, 1.4fr) minmax(130px, 0.9fr) minmax(90px, 0.6fr);
        gap: 8px;
        padding: 12px 16px;
        border-bottom: 1px solid rgba(226, 232, 240, 0.9);
      }
      .awc-field { display: flex; flex-direction: column; gap: 4px; min-width: 120px; }
      .awc-field label { font-size: 12px; color: #5b6b79; }
      .awc-input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 13px;
        background: #fff;
      }
      .awc-input-number { min-width: 76px; }
      .awc-buttons { grid-column: 1 / -1; display: flex; gap: 8px; flex-wrap: wrap; }
      .awc-button {
        border: 0;
        border-radius: 10px;
        padding: 9px 12px;
        font-size: 13px;
        cursor: pointer;
        background: #0f172a;
        color: #fff;
      }
      .awc-button-secondary { background: #e2e8f0; color: #10212a; }
      .awc-button-danger { background: #fee2e2; color: #991b1b; }
      .awc-totals {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        padding: 10px 16px 12px;
        border-bottom: 1px solid rgba(226, 232, 240, 0.9);
        background: #f8fafc;
      }
      .awc-total-card {
        min-width: 0;
        padding: 10px 12px;
        border: 1px solid #dbe4ee;
        border-radius: 8px;
        background: #fff;
      }
      .awc-total-card span {
        display: block;
        margin-bottom: 6px;
        font-size: 12px;
        color: #64748b;
      }
      .awc-total-card strong {
        display: block;
        font-size: 18px;
        line-height: 1.1;
        color: #0f172a;
        white-space: nowrap;
      }
      .awc-total-card-primary {
        border-color: rgba(37, 99, 235, 0.22);
        background: #eff6ff;
      }
      .awc-mini {
        position: fixed;
        z-index: 2147483647;
        display: none;
        width: min(320px, calc(100vw - 24px));
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.94);
        color: #fff;
        box-shadow: 0 10px 28px rgba(15, 23, 42, 0.28);
        border: 1px solid rgba(255, 255, 255, 0.18);
        font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
        overflow: hidden;
        cursor: move;
        user-select: none;
      }
      .awc-mini-dragging { opacity: 0.9; }
      .awc-mini-inner {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 4px 10px;
        align-items: center;
        padding: 10px 12px;
      }
      .awc-mini-title { font-size: 13px; font-weight: 700; }
      .awc-mini-summary, .awc-mini-latest { font-size: 12px; color: #cbd5e1; }
      .awc-mini-latest { grid-column: 1 / -1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .awc-mini-button {
        grid-row: 1 / span 2;
        grid-column: 2;
        border: 0;
        border-radius: 8px;
        padding: 7px 10px;
        background: #f8fafc;
        color: #0f172a;
        cursor: pointer;
        font-size: 12px;
      }
      .awc-table-wrap { flex: 1; min-height: 120px; overflow: auto; padding: 0 12px 12px; }
      .awc-table { width: 100%; border-collapse: collapse; font-size: 12px; }
      .awc-table th, .awc-table td {
        padding: 8px;
        border-bottom: 1px solid rgba(226, 232, 240, 0.9);
        vertical-align: top;
      }
      .awc-table th {
        position: sticky;
        top: 0;
        background: #f8fafc;
        text-align: left;
        z-index: 1;
      }
      .awc-data-row { cursor: pointer; }
      .awc-data-row:hover td { background: rgba(239, 246, 255, 0.75); }
      .awc-data-row-active td { background: rgba(219, 234, 254, 0.95); }
      .awc-data-row-active td:first-child {
        border-left: 3px solid #2563eb;
        border-top-left-radius: 6px;
        border-bottom-left-radius: 6px;
      }
      .awc-data-row-active td:last-child {
        border-right: 1px solid rgba(37, 99, 235, 0.25);
        border-top-right-radius: 6px;
        border-bottom-right-radius: 6px;
      }
      .awc-data-row-dragging { opacity: 0.5; }
      .awc-data-row-drop-target td {
        background: rgba(224, 242, 254, 0.95);
        border-top: 2px solid #0284c7;
      }
      .awc-serial-cell { color: #64748b; font-weight: 700; }
      .awc-circuit-row td {
        position: sticky;
        top: 34px;
        z-index: 1;
        background: #eef6ff;
        border-bottom-color: #c7ddf5;
      }
      .awc-circuit-toggle {
        margin-right: 8px;
        border: 0;
        border-radius: 8px;
        padding: 5px 8px;
        background: #dbeafe;
        color: #0f3b68;
        cursor: pointer;
        font-size: 12px;
      }
      .awc-circuit-title { margin-right: 12px; font-weight: 700; }
      .awc-circuit-inline-summary { color: #475569; }
      .awc-circuit-total-row td {
        background: #f8fafc;
        font-weight: 700;
      }
      .awc-circuit-total-label { color: #334155; }
      .awc-hover-tooltip {
        position: fixed;
        z-index: 2147483647;
        display: none;
        min-width: 220px;
        max-width: 320px;
        padding: 10px 12px;
        border-radius: 8px;
        background: rgba(15, 23, 42, 0.94);
        color: #fff;
        box-shadow: 0 10px 28px rgba(15, 23, 42, 0.28);
        pointer-events: none;
        font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
        font-size: 12px;
        line-height: 1.55;
      }
      .awc-hover-tooltip-title {
        margin-bottom: 6px;
        font-size: 13px;
        font-weight: 700;
      }
      .awc-hover-tooltip-row {
        display: flex;
        gap: 8px;
      }
      .awc-hover-tooltip-label {
        flex: 0 0 58px;
        color: #cbd5e1;
      }
      .awc-hover-tooltip-value {
        flex: 1;
        min-width: 0;
        word-break: break-word;
      }
      @media (max-width: 1200px) {
        .awc-toolbar { grid-template-columns: repeat(2, minmax(140px, 1fr)); }
      }
    `
    document.documentElement.appendChild(style)
  }

  function installPanelDrag() {
    if (!state.panel || !state.headEl) {
      return
    }

    let dragState = null

    const onPointerMove = (event) => {
      if (!dragState) {
        return
      }

      applyPanelPosition(
        {
          left: dragState.startLeft + (event.clientX - dragState.startX),
          top: dragState.startTop + (event.clientY - dragState.startY),
        },
        false,
      )
    }

    const onPointerUp = () => {
      if (!dragState || !state.panel) {
        dragState = null
        return
      }

      state.panel.classList.remove('awc-panel-dragging')
      const left = Number.parseFloat(state.panel.style.left) || getDefaultPanelPosition().left
      const top = Number.parseFloat(state.panel.style.top) || getDefaultPanelPosition().top
      dragState = null
      applyPanelPosition({ left, top }, true)
      pageWindow.removeEventListener('pointermove', onPointerMove)
      pageWindow.removeEventListener('pointerup', onPointerUp)
    }

    state.headEl.addEventListener('pointerdown', (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return
      }

      if (target.closest('button, input, textarea, select, a')) {
        return
      }

      dragState = {
        startX: event.clientX,
        startY: event.clientY,
        startLeft:
          Number.parseFloat(state.panel.style.left) || getDefaultPanelPosition().left,
        startTop:
          Number.parseFloat(state.panel.style.top) || getDefaultPanelPosition().top,
      }

      state.panel.classList.add('awc-panel-dragging')
      pageWindow.addEventListener('pointermove', onPointerMove)
      pageWindow.addEventListener('pointerup', onPointerUp)
    })
  }

  function installPanelResize() {
    if (!state.panel || typeof ResizeObserver !== 'function' || state.panel.__awcResizeInstalled) {
      return
    }

    state.panel.__awcResizeInstalled = true
    let resizeTimer = null
    const observer = new ResizeObserver(() => {
      pageWindow.clearTimeout(resizeTimer)
      resizeTimer = pageWindow.setTimeout(() => {
        if (!state.panel) {
          return
        }

        state.panelSize = {
          width: state.panel.offsetWidth,
          height: state.panel.offsetHeight,
        }
        persistState()
        applyPanelPosition(
          {
            left: Number.parseFloat(state.panel.style.left) || getDefaultPanelPosition().left,
            top: Number.parseFloat(state.panel.style.top) || getDefaultPanelPosition().top,
          },
          false,
        )
      }, 120)
    })

    observer.observe(state.panel)
  }

  function positionMini() {
    if (!state.miniEl) {
      return
    }

    const position = state.panelPosition || getDefaultPanelPosition()
    const left = Math.min(Math.max(position.left, 8), Math.max(8, pageWindow.innerWidth - 340))
    const top = Math.min(Math.max(position.top, 8), Math.max(8, pageWindow.innerHeight - 120))

    state.miniEl.style.left = `${left}px`
    state.miniEl.style.top = `${top}px`
  }

  function applyMiniPosition(position, persist = false) {
    if (!state.miniEl) {
      return
    }

    const width = state.miniEl.offsetWidth || 320
    const height = state.miniEl.offsetHeight || 90
    const nextPosition = {
      left: Math.min(Math.max(position.left, 8), Math.max(8, pageWindow.innerWidth - width - 8)),
      top: Math.min(Math.max(position.top, 8), Math.max(8, pageWindow.innerHeight - height - 8)),
    }

    state.miniEl.style.left = `${nextPosition.left}px`
    state.miniEl.style.top = `${nextPosition.top}px`
    state.panelPosition = nextPosition

    if (persist) {
      persistState()
    }
  }

  function installMiniDrag() {
    if (!state.miniEl || state.miniEl.__awcMiniDragInstalled) {
      return
    }

    state.miniEl.__awcMiniDragInstalled = true
    let dragState = null

    const onPointerMove = (event) => {
      if (!dragState) {
        return
      }

      applyMiniPosition(
        {
          left: dragState.startLeft + (event.clientX - dragState.startX),
          top: dragState.startTop + (event.clientY - dragState.startY),
        },
        false,
      )
    }

    const onPointerUp = () => {
      if (!dragState || !state.miniEl) {
        dragState = null
        return
      }

      state.miniEl.classList.remove('awc-mini-dragging')
      const left = Number.parseFloat(state.miniEl.style.left) || getDefaultPanelPosition().left
      const top = Number.parseFloat(state.miniEl.style.top) || getDefaultPanelPosition().top
      dragState = null
      applyMiniPosition({ left, top }, true)
      pageWindow.removeEventListener('pointermove', onPointerMove)
      pageWindow.removeEventListener('pointerup', onPointerUp)
    }

    state.miniEl.addEventListener('pointerdown', (event) => {
      const target = event.target
      if (target instanceof HTMLElement && target.closest('button, input, textarea, select, a')) {
        return
      }

      dragState = {
        startX: event.clientX,
        startY: event.clientY,
        startLeft: Number.parseFloat(state.miniEl.style.left) || getDefaultPanelPosition().left,
        startTop: Number.parseFloat(state.miniEl.style.top) || getDefaultPanelPosition().top,
      }

      state.miniEl.classList.add('awc-mini-dragging')
      pageWindow.addEventListener('pointermove', onPointerMove)
      pageWindow.addEventListener('pointerup', onPointerUp)
    })
  }

  function installMini() {
    if (state.miniEl || !document.body) {
      return
    }

    const mini = document.createElement('section')
    mini.className = 'awc-mini'
    mini.innerHTML = `
      <div class="awc-mini-inner">
        <div class="awc-mini-title"></div>
        <button class="awc-mini-button" type="button">\u5c55\u5f00</button>
        <div class="awc-mini-summary"></div>
        <div class="awc-mini-latest"></div>
      </div>
    `

    mini.querySelector('.awc-mini-button').addEventListener('click', () => {
      setMinimized(false)
    })
    mini.addEventListener('dblclick', () => {
      setMinimized(false)
    })

    document.body.appendChild(mini)
    state.miniEl = mini
    positionMini()
    installMiniDrag()
    updateMini()
  }

  function ensureHoverTooltip() {
    if (state.hoverTooltipEl || !document.body) {
      return state.hoverTooltipEl
    }

    const tooltip = document.createElement('div')
    tooltip.className = 'awc-hover-tooltip'
    document.body.appendChild(tooltip)
    state.hoverTooltipEl = tooltip
    return tooltip
  }

  function hideHoverTooltip() {
    if (state.hoverTooltipEl) {
      state.hoverTooltipEl.style.display = 'none'
    }
  }

  function addTooltipLine(parent, label, value) {
    const line = document.createElement('div')
    line.className = 'awc-hover-tooltip-row'

    const labelEl = document.createElement('span')
    labelEl.className = 'awc-hover-tooltip-label'
    labelEl.textContent = label

    const valueEl = document.createElement('span')
    valueEl.className = 'awc-hover-tooltip-value'
    valueEl.textContent = value

    line.appendChild(labelEl)
    line.appendChild(valueEl)
    parent.appendChild(line)
  }

  function positionHoverTooltip(event) {
    const tooltip = state.hoverTooltipEl
    if (!tooltip) {
      return
    }

    const margin = 12
    const width = tooltip.offsetWidth || 260
    const height = tooltip.offsetHeight || 150
    let left = event.clientX + 14
    let top = event.clientY + 14

    if (left + width + margin > pageWindow.innerWidth) {
      left = event.clientX - width - 14
    }

    if (top + height + margin > pageWindow.innerHeight) {
      top = event.clientY - height - 14
    }

    tooltip.style.left = `${Math.max(margin, left)}px`
    tooltip.style.top = `${Math.max(margin, top)}px`
  }

  function showHoverTooltip(row, event) {
    const tooltip = ensureHoverTooltip()
    if (!tooltip) {
      return
    }

    tooltip.innerHTML = ''

    const title = document.createElement('div')
    title.className = 'awc-hover-tooltip-title'
    title.textContent = getDisplayName(row)
    tooltip.appendChild(title)

    const circuitText = [normalizeText(row.circuitCode), normalizeText(row.circuitName)]
      .filter(Boolean)
      .join(' / ')

    addTooltipLine(tooltip, '回路', circuitText || TEXT.unnamedCircuit)
    addTooltipLine(tooltip, '编号', normalizeText(row.identifier) || String(row.dbId))
    addTooltipLine(tooltip, '尺寸', normalizeText(row.pipeSize) || normalizeText(row.pipeModel) || '-')
    addTooltipLine(tooltip, '长度', `${formatNumber(row.lengthMeters)} m`)
    addTooltipLine(tooltip, '导线', `${normalizeText(row.wireModel) || DEFAULT_WIRE_MODEL} × ${row.wireCount} 根`)
    addTooltipLine(tooltip, '电线量', `${formatNumber(row.lengthMeters * row.wireCount)} m`)

    if (normalizeText(row.lengthSourceText)) {
      addTooltipLine(tooltip, '原始', normalizeText(row.lengthSourceText))
    }

    tooltip.style.display = 'block'
    positionHoverTooltip(event)
  }

  function installPanel() {
    if (state.panel || !document.body) {
      return
    }

    installStyle()

    const panel = document.createElement('section')
    panel.className = 'awc-panel'

    const head = document.createElement('div')
    head.className = 'awc-head'
    head.innerHTML = `
      <div class="awc-head-top">
        <h2 class="awc-title">${TEXT.title}<span class="awc-version-badge">v${SCRIPT_VERSION}</span></h2>
        <button class="awc-minimize-button" type="button">\u6700\u5c0f\u5316</button>
      </div>
      <div class="awc-subtitle">${TEXT.subtitle}</div>
      <div class="awc-drag-hint">${TEXT.dragHint}</div>
      <div class="awc-summary"></div>
      <div class="awc-status">${TEXT.waitingViewer}</div>
    `

    const toolbar = document.createElement('div')
    toolbar.className = 'awc-toolbar'

    const circuitCodeField = document.createElement('div')
    circuitCodeField.className = 'awc-field'
    circuitCodeField.innerHTML = '<label>\u5f53\u524d\u56de\u8def\u7f16\u53f7</label>'
    const circuitCodeInput = createInput(state.currentCircuitCode)
    circuitCodeInput.addEventListener('input', () => {
      state.currentCircuitCode = circuitCodeInput.value.trim()
      persistState()
    })
    circuitCodeField.appendChild(circuitCodeInput)

    const circuitNameField = document.createElement('div')
    circuitNameField.className = 'awc-field'
    circuitNameField.innerHTML = '<label>\u5f53\u524d\u56de\u8def\u540d\u79f0</label>'
    const circuitNameInput = createInput(state.currentCircuitName)
    circuitNameInput.addEventListener('input', () => {
      state.currentCircuitName = circuitNameInput.value.trim()
      persistState()
    })
    circuitNameField.appendChild(circuitNameInput)

    const wireModelField = document.createElement('div')
    wireModelField.className = 'awc-field'
    wireModelField.innerHTML = '<label>\u9ed8\u8ba4\u5bfc\u7ebf\u578b\u53f7</label>'
    const wireModelInput = createInput(state.defaultWireModel)
    wireModelInput.addEventListener('input', () => {
      state.defaultWireModel = wireModelInput.value.trim() || DEFAULT_WIRE_MODEL
      persistState()
    })
    wireModelField.appendChild(wireModelInput)

    const wireCountField = document.createElement('div')
    wireCountField.className = 'awc-field'
    wireCountField.innerHTML = '<label>\u9ed8\u8ba4\u7ebf\u6570</label>'
    const wireCountInput = createInput(
      String(state.defaultWireCount),
      'awc-input awc-input-number',
      'number',
    )
    wireCountInput.min = '0'
    wireCountInput.addEventListener('input', () => {
      state.defaultWireCount = Math.max(0, Number(wireCountInput.value) || 0)
      persistState()
    })
    wireCountField.appendChild(wireCountInput)

    const buttons = document.createElement('div')
    buttons.className = 'awc-buttons'

    const captureButton = document.createElement('button')
    captureButton.className = 'awc-button'
    captureButton.textContent = TEXT.captureButton
    captureButton.addEventListener('click', () => {
      void captureCurrentSelection()
    })

    const exportButton = document.createElement('button')
    exportButton.className = 'awc-button awc-button-secondary'
    exportButton.textContent = TEXT.exportButton
    exportButton.addEventListener('click', exportCsv)

    const exportProjectButton = document.createElement('button')
    exportProjectButton.className = 'awc-button awc-button-secondary'
    exportProjectButton.textContent = TEXT.exportProjectButton
    exportProjectButton.addEventListener('click', exportProject)

    const importProjectButton = document.createElement('button')
    importProjectButton.className = 'awc-button awc-button-secondary'
    importProjectButton.textContent = TEXT.importProjectButton
    importProjectButton.addEventListener('click', openProjectImportPicker)

    const clearButton = document.createElement('button')
    clearButton.className = 'awc-button awc-button-secondary'
    clearButton.textContent = TEXT.clearButton
    clearButton.addEventListener('click', () => {
      state.rows.clear()
      state.collapsedCircuits.clear()
      persistState()
      renderRows()
      setStatus(TEXT.cleared)
    })

    buttons.appendChild(captureButton)
    buttons.appendChild(exportButton)
    buttons.appendChild(exportProjectButton)
    buttons.appendChild(importProjectButton)
    buttons.appendChild(clearButton)

    toolbar.appendChild(circuitCodeField)
    toolbar.appendChild(circuitNameField)
    toolbar.appendChild(wireModelField)
    toolbar.appendChild(wireCountField)
    toolbar.appendChild(buttons)

    const totals = document.createElement('div')
    totals.className = 'awc-totals'
    totals.innerHTML = `
      <div class="awc-total-card">
        <span>\u8bb0\u5f55 / \u56de\u8def</span>
        <strong data-awc-total-count>0 \u6bb5 / 0 \u56de\u8def</strong>
      </div>
      <div class="awc-total-card awc-total-card-primary">
        <span>\u7ba1\u957f\u603b\u8ba1</span>
        <strong data-awc-total-length>0.00 m</strong>
      </div>
      <div class="awc-total-card awc-total-card-primary">
        <span>\u7535\u7ebf\u603b\u91cf</span>
        <strong data-awc-total-wire>0.00 m</strong>
      </div>
    `

    const tableWrap = document.createElement('div')
    tableWrap.className = 'awc-table-wrap'
    tableWrap.innerHTML = `
      <table class="awc-table">
        <thead>
          <tr>
            <th>\u5e8f\u53f7</th>
            <th>\u56de\u8def\u7f16\u53f7</th>
            <th>\u56de\u8def\u540d\u79f0</th>
            <th>\u5c5e\u6027ID / dbId</th>
            <th>\u5c3a\u5bf8</th>
            <th>\u957f\u5ea6(m)</th>
            <th>\u5bfc\u7ebf\u578b\u53f7</th>
            <th>\u7ebf\u6570</th>
            <th>\u7535\u7ebf\u91cf(m)</th>
            <th>\u64cd\u4f5c</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    `

    panel.appendChild(head)
    panel.appendChild(toolbar)
    panel.appendChild(totals)
    panel.appendChild(tableWrap)
    document.body.appendChild(panel)

    state.panel = panel
    state.headEl = head
    state.statusEl = head.querySelector('.awc-status')
    state.summaryEl = head.querySelector('.awc-summary')
    state.totalsEl = totals
    state.tbodyEl = tableWrap.querySelector('tbody')
    head.querySelector('.awc-minimize-button')?.addEventListener('click', () => {
      setMinimized(true)
    })

    installMini()
    applyPanelSize(state.panelSize || getDefaultPanelSize(), false)
    applyPanelPosition(state.panelPosition || getDefaultPanelPosition(), false)
    ensureHoverTooltip()
    installPanelDrag()
    installPanelResize()
    renderRows()
    setStatus(TEXT.waitingViewer)
    setMinimized(state.isMinimized, false)
  }

  function waitForBody() {
    if (document.body) {
      installPanel()
      return
    }

    const observer = new MutationObserver(() => {
      if (!document.body) {
        return
      }

      observer.disconnect()
      installPanel()
    })

    observer.observe(document.documentElement, { childList: true, subtree: true })
  }

  function getInstanceTree(model) {
    try {
      return model?.getData?.().instanceTree ?? null
    } catch {
      return null
    }
  }

  function getNodeName(model, dbId) {
    const tree = getInstanceTree(model)

    if (!tree || typeof tree.getNodeName !== 'function') {
      return ''
    }

    return normalizeText(tree.getNodeName(dbId))
  }

  function getNodeFragmentBounds(model, dbId) {
    const tree = getInstanceTree(model)
    const fragmentList =
      typeof model?.getFragmentList === 'function' ? model.getFragmentList() : model?.getData?.().fragments
    const Box3 = pageWindow.THREE?.Box3

    if (
      !tree ||
      typeof tree.enumNodeFragments !== 'function' ||
      !fragmentList ||
      typeof fragmentList.getWorldBounds !== 'function' ||
      typeof Box3 !== 'function'
    ) {
      return null
    }

    const bounds = new Box3()
    const fragmentBounds = new Box3()
    let fragmentCount = 0

    try {
      tree.enumNodeFragments(
        dbId,
        (fragId) => {
          fragmentList.getWorldBounds(fragId, fragmentBounds)
          bounds.union(fragmentBounds)
          fragmentCount += 1
        },
        false,
      )
    } catch {
      return null
    }

    if (fragmentCount === 0 || !bounds.min || !bounds.max) {
      return null
    }

    return bounds
  }

  function getBoundDimensions(bounds) {
    if (!bounds?.min || !bounds?.max) {
      return null
    }

    return [
      Math.abs(bounds.max.x - bounds.min.x),
      Math.abs(bounds.max.y - bounds.min.y),
      Math.abs(bounds.max.z - bounds.min.z),
    ].sort((left, right) => right - left)
  }

  function getPhysicalPipeGeometryStatus(model, dbId, lengthMeters) {
    const dimensions = getBoundDimensions(getNodeFragmentBounds(model, dbId))
    if (!dimensions) {
      return null
    }

    const [longest, middle] = dimensions
    if (!Number.isFinite(longest) || longest <= 0 || !Number.isFinite(middle)) {
      return false
    }

    const unitsPerMeter =
      Number.isFinite(lengthMeters) && lengthMeters > 0 ? longest / lengthMeters : 0

    if (unitsPerMeter > 0) {
      return middle / unitsPerMeter >= MIN_PHYSICAL_PIPE_THICKNESS_METERS
    }

    return middle > longest * 0.001
  }

  async function getProperties(model, dbId) {
    return await new Promise((resolve, reject) => {
      try {
        model.getProperties(
          dbId,
          (result) => resolve(result || { dbId, name: '', properties: [] }),
          (error) => reject(error),
        )
      } catch (error) {
        reject(error)
      }
    })
  }

  function getIdentifierFromProperties(propertyMap, fallbackDbId) {
    return (
      getPropertyEntryText(findPropertyValue(propertyMap, IDENTIFIER_KEYS)) ||
      `${getPropertyEntryText(findPropertyValue(propertyMap, ['element id'])) || fallbackDbId}`
    )
  }

  async function getPipeRecordInfo(model, dbId) {
    const normalizedDbId = Number(dbId)
    if (!model || !Number.isInteger(normalizedDbId) || normalizedDbId < 0) {
      return null
    }

    const properties = await getProperties(model, normalizedDbId)
    const propertyMap = getPropertyMap(properties.properties)
    const name = normalizeText(properties.name || getNodeName(model, normalizedDbId) || TEXT.unnamed)
    const lengthProperty = findPropertyValue(propertyMap, LENGTH_KEYS)
    const lengthMeters = parseLengthMeters(lengthProperty)
    const isNonPhysicalLine = looksLikeNonPhysicalLine(propertyMap, name)
    const hasPhysicalGeometry = getPhysicalPipeGeometryStatus(model, normalizedDbId, lengthMeters)

    return {
      model,
      dbId: normalizedDbId,
      propertyMap,
      name,
      isPipe: looksLikePipe(propertyMap, name) && !isNonPhysicalLine && hasPhysicalGeometry !== false,
      isNonPhysicalLine,
      hasPhysicalGeometry,
      identifier: getIdentifierFromProperties(propertyMap, normalizedDbId),
      level: getPropertyEntryText(findPropertyValue(propertyMap, LEVEL_KEYS)),
      pipeModel: getPropertyEntryText(findPropertyValue(propertyMap, MODEL_KEYS)),
      pipeSize: buildPropertySourceText(findPropertyValue(propertyMap, SIZE_KEYS)),
      lengthMeters,
      lengthSourceText: buildLengthSourceText(lengthProperty),
    }
  }

  function isRecordablePipeInfo(info) {
    return Boolean(info?.isPipe && info.lengthMeters != null && info.lengthMeters > 0)
  }

  async function captureDbId(model, dbId, options = {}) {
    const deferUi = Boolean(options.deferUi)
    const rawDbId = Number(dbId)
    if (!model || !Number.isInteger(rawDbId) || rawDbId < 0) {
      return null
    }

    const captureKey = getRowKey(model, rawDbId)
    if (state.pendingCaptureKeys.has(captureKey)) {
      return null
    }

    state.pendingCaptureKeys.add(captureKey)

    try {
      const recordInfo = await getPipeRecordInfo(model, rawDbId)

      if (!isRecordablePipeInfo(recordInfo)) {
        if (!deferUi) {
          setStatus(`${TEXT.notPipePrefix}${recordInfo?.name || `dbId ${rawDbId}`}`)
        }
        return null
      }

      const identifier = recordInfo.identifier
      const level = recordInfo.level
      const pipeModel = recordInfo.pipeModel
      const pipeSize = recordInfo.pipeSize
      const lengthMeters = recordInfo.lengthMeters
      const lengthSourceText = recordInfo.lengthSourceText
      const key = getRowKey(model, rawDbId)
      const existing = state.rows.get(key)

      if (existing) {
        existing.level = normalizeText(existing.level) || level
        existing.pipeModel = normalizeText(existing.pipeModel) || pipeModel
        existing.pipeSize = normalizeText(existing.pipeSize) || pipeSize
        existing.lengthSourceText = normalizeText(existing.lengthSourceText) || lengthSourceText
        existing.lengthMeters = Number(existing.lengthMeters) || lengthMeters
        if (deferUi) {
          return existing
        }

        persistState()
        renderRows()
        activateRow(existing)
        setStatus(
          `\u5df2\u7edf\u8ba1\u8fc7\uff1a${normalizeText(existing.identifier) || rawDbId}\uff0c\u5df2\u9009\u4e2d\u5bf9\u5e94\u884c`,
        )
        return existing
      }

      const circuitCode = state.currentCircuitCode
      const circuitName = state.currentCircuitName

      const nextRow = {
        key,
        modelId: getModelId(model),
        dbId: rawDbId,
        createdAt: Date.now(),
        orderIndex: getNextOrderIndexForCircuit(circuitCode, circuitName),
        identifier,
        name,
        customName: '',
        level,
        pipeModel,
        pipeSize,
        lengthMeters,
        lengthSourceText,
        wireModel: state.defaultWireModel,
        wireCount: state.defaultWireCount,
        circuitCode,
        circuitName,
      }

      state.rows.set(key, nextRow)

      if (deferUi) {
        return nextRow
      }

      persistState()
      renderRows()
      activateRow(nextRow)
      setStatus(
        `${TEXT.recordedPrefix}\u6784\u4ef6 ${identifier}\uff0c\u7ba1\u957f ${formatNumber(lengthMeters)} m\uff08\u5c5e\u6027\u539f\u503c\uff1a${lengthSourceText || '-'}\uff09`,
      )
      return nextRow
    } catch (error) {
      console.warn('Failed to capture wire counter object', error)
      if (!deferUi) {
        setStatus(`读取线管属性失败：dbId ${rawDbId}`)
      }
      return null
    } finally {
      state.pendingCaptureKeys.delete(captureKey)
    }
  }

  async function captureSelectionPairs(pairs) {
    const uniquePairs = []
    const seen = new Set()

    for (const pair of pairs) {
      const rawDbId = Number(pair.dbId)

      if (!pair.model || !Number.isInteger(rawDbId) || rawDbId < 0) {
        continue
      }

      const key = getRowKey(pair.model, rawDbId)
      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      uniquePairs.push({ model: pair.model, dbId: rawDbId })
    }

    if (uniquePairs.length === 0) {
      setStatus(TEXT.waitingSelection)
      return
    }

    if (uniquePairs.length === 1) {
      await captureDbId(uniquePairs[0].model, uniquePairs[0].dbId)
      return
    }

    const capturedRows = []

    for (const pair of uniquePairs) {
      const row = await captureDbId(pair.model, pair.dbId, { deferUi: true })
      if (row) {
        capturedRows.push(row)
      }
    }

    if (capturedRows.length === 0) {
      setStatus('\u672a\u8bb0\u5f55\u5230\u53ef\u7edf\u8ba1\u7684\u7ebf\u7ba1\u5bf9\u8c61')
      return
    }

    persistState()
    renderRows()
    activateRow(capturedRows[capturedRows.length - 1])
    setStatus(`\u5df2\u6279\u91cf\u5904\u7406 ${capturedRows.length} \u4e2a\u7ebf\u7ba1\u5bf9\u8c61`)
  }

  async function captureCurrentSelection() {
    if (!state.viewer) {
      setStatus(TEXT.viewerMissing)
      return
    }

    const aggregateSelection =
      typeof state.viewer.getAggregateSelection === 'function'
        ? state.viewer.getAggregateSelection()
        : []

    if (aggregateSelection.length > 0) {
      await captureSelectionPairs(
        aggregateSelection.flatMap((selection) => {
          const model = selection.model || state.viewer.model
          return toArray(selection.selection || selection.dbIdArray).map((dbId) => ({ model, dbId }))
        }),
      )
      return
    }

    const dbIds = typeof state.viewer.getSelection === 'function' ? state.viewer.getSelection() : []
    const model = state.viewer.model

    if (!model || dbIds.length === 0) {
      setStatus(TEXT.waitingSelection)
      return
    }

    await captureSelectionPairs(dbIds.map((dbId) => ({ model, dbId })))
  }

  function getHitTestResult(viewer, event, options = {}) {
    const hitTest = viewer?.impl?.hitTest
    if (typeof hitTest !== 'function') {
      return null
    }

    const ignoreTransparent = Boolean(options.ignoreTransparent)
    const canvas = getViewerCanvas(viewer)
    const rect = canvas?.getBoundingClientRect?.()
    const x = rect ? event.clientX - rect.left : event.offsetX
    const y = rect ? event.clientY - rect.top : event.offsetY
    const attempts = [
      [x, y],
      [event.clientX, event.clientY],
    ]

    for (const [hitX, hitY] of attempts) {
      try {
        const result = hitTest.call(viewer.impl, hitX, hitY, ignoreTransparent)
        if (result?.dbId != null) {
          return result
        }
      } catch {
        // Try the next coordinate mode; Autodesk Viewer builds differ here.
      }
    }

    return null
  }

  function getViewerCanvas(viewer) {
    return viewer?.impl?.canvas || viewer?.canvas || viewer?.container?.querySelector?.('canvas') || null
  }

  function getCanvasPointer(viewer, event) {
    const canvas = getViewerCanvas(viewer)
    const rect = canvas?.getBoundingClientRect?.()
    if (!canvas || !rect || rect.width <= 0 || rect.height <= 0) {
      return null
    }

    const cssX = event.clientX - rect.left
    const cssY = event.clientY - rect.top
    if (cssX < 0 || cssY < 0 || cssX > rect.width || cssY > rect.height) {
      return null
    }

    return { canvas, rect, cssX, cssY }
  }

  function getCanvasGlContext(canvas) {
    if (!canvas) {
      return null
    }

    if (canvas.__awcGlContext) {
      return canvas.__awcGlContext
    }

    for (const contextName of ['webgl2', 'webgl', 'experimental-webgl']) {
      try {
        const gl = canvas.getContext?.(contextName)
        if (gl) {
          canvas.__awcGlContext = gl
          return gl
        }
      } catch {
        // Some Autodesk Viewer builds reject repeated context lookup names.
      }
    }

    return null
  }

  function isWireHoverPixel(red, green, blue, alpha) {
    if (alpha < 40) {
      return false
    }

    return red >= 135 && red > green * 1.45 && red > blue * 1.45 && green <= 120 && blue <= 120
  }

  function hasWirePixelNearPointer(viewer, event) {
    const pointer = getCanvasPointer(viewer, event)
    const gl = getCanvasGlContext(pointer?.canvas)
    if (!pointer || !gl || typeof gl.readPixels !== 'function') {
      return false
    }

    const bufferWidth = gl.drawingBufferWidth || pointer.canvas.width
    const bufferHeight = gl.drawingBufferHeight || pointer.canvas.height
    if (!bufferWidth || !bufferHeight) {
      return false
    }

    const pixelX = Math.round((pointer.cssX / pointer.rect.width) * bufferWidth)
    const pixelY = Math.round((1 - pointer.cssY / pointer.rect.height) * bufferHeight)
    const radiusX = Math.max(1, Math.round((WIRE_HOVER_PIXEL_RADIUS / pointer.rect.width) * bufferWidth))
    const radiusY = Math.max(1, Math.round((WIRE_HOVER_PIXEL_RADIUS / pointer.rect.height) * bufferHeight))
    const x = Math.max(0, Math.min(bufferWidth - 1, pixelX - radiusX))
    const y = Math.max(0, Math.min(bufferHeight - 1, pixelY - radiusY))
    const width = Math.max(1, Math.min(bufferWidth - x, radiusX * 2 + 1))
    const height = Math.max(1, Math.min(bufferHeight - y, radiusY * 2 + 1))
    const pixels = new Uint8Array(width * height * 4)

    try {
      gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    } catch {
      return false
    }

    for (let index = 0; index < pixels.length; index += 4) {
      if (isWireHoverPixel(pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3])) {
        return true
      }
    }

    return false
  }

  function installViewerHover(viewer) {
    const target = viewer?.container || viewer?.impl?.canvas || viewer?.canvas
    if (!target || target.__awcHoverInstalled) {
      return
    }

    target.__awcHoverInstalled = true
    let pendingHoverEvent = null
    let hoverFrameId = 0

    const requestFrame =
      typeof pageWindow.requestAnimationFrame === 'function'
        ? (callback) => pageWindow.requestAnimationFrame(callback)
        : (callback) => pageWindow.setTimeout(callback, 16)
    const cancelFrame =
      typeof pageWindow.cancelAnimationFrame === 'function'
        ? (frameId) => pageWindow.cancelAnimationFrame(frameId)
        : (frameId) => pageWindow.clearTimeout(frameId)

    const runHoverHitTest = () => {
      hoverFrameId = 0

      const event = pendingHoverEvent
      pendingHoverEvent = null

      if (!event) {
        return
      }

      if (state.rows.size === 0) {
        hideHoverTooltip()
        return
      }

      const hit = getHitTestResult(viewer, event, { ignoreTransparent: false })
      const dbId = Number(hit?.dbId)
      const model = hit?.model || viewer.model

      if (!Number.isInteger(dbId) || dbId < 0 || !model) {
        hideHoverTooltip()
        return
      }

      const row = findRecordedRowForDbId(model, dbId)
      if (!row) {
        hideHoverTooltip()
        return
      }

      if (!hasWirePixelNearPointer(viewer, event)) {
        hideHoverTooltip()
        return
      }

      showHoverTooltip(row, event)
    }

    target.addEventListener(
      'mousemove',
      (event) => {
        pendingHoverEvent = {
          clientX: event.clientX,
          clientY: event.clientY,
          offsetX: event.offsetX,
          offsetY: event.offsetY,
        }

        if (!hoverFrameId) {
          hoverFrameId = requestFrame(runHoverHitTest)
        }
      },
      { passive: true },
    )

    target.addEventListener(
      'mouseleave',
      () => {
        pendingHoverEvent = null
        if (hoverFrameId) {
          cancelFrame(hoverFrameId)
          hoverFrameId = 0
        }
        hideHoverTooltip()
      },
      { passive: true },
    )
  }

  function attachViewer(viewer) {
    if (!viewer || state.attachedViewerIds.has(viewer)) {
      return
    }

    state.attachedViewerIds.add(viewer)
    state.viewer = viewer
    installViewerHover(viewer)

    const viewing = pageWindow.Autodesk?.Viewing

    if (viewing?.AGGREGATE_SELECTION_CHANGED_EVENT) {
      viewer.addEventListener(viewing.AGGREGATE_SELECTION_CHANGED_EVENT, (event) => {
        if (Date.now() < state.suppressSelectionCaptureUntil) {
          return
        }

        void captureSelectionPairs(
          toArray(event.selections).flatMap((selection) => {
            const model = selection.model || viewer.model
            return toArray(selection.dbIdArray).map((dbId) => ({ model, dbId }))
          }),
        )
      })
    }

    if (viewing?.SELECTION_CHANGED_EVENT) {
      viewer.addEventListener(viewing.SELECTION_CHANGED_EVENT, (event) => {
        if (Date.now() < state.suppressSelectionCaptureUntil) {
          return
        }

        const model = event.model || viewer.model
        void captureSelectionPairs(toArray(event.dbIdArray).map((dbId) => ({ model, dbId })))
      })
    }

    setStatus(TEXT.viewerReady)
  }

  function patchViewerPrototype(candidate) {
    if (!candidate?.prototype || candidate.prototype.__awcPatched) {
      return
    }

    const originalStart = candidate.prototype.start

    if (typeof originalStart === 'function') {
      candidate.prototype.start = function patchedStart(...args) {
        const result = originalStart.apply(this, args)
        pageWindow.setTimeout(() => attachViewer(this), 0)
        return result
      }
    }

    candidate.prototype.__awcPatched = true
  }

  function scanKnownGlobals() {
    const candidates = ['viewer', 'Viewer', 'NOP_VIEWER', 'guiViewer3D', 'avViewer']

    for (const name of candidates) {
      const value = pageWindow[name]
      if (
        value &&
        typeof value.addEventListener === 'function' &&
        typeof value.getSelection === 'function'
      ) {
        attachViewer(value)
      }
    }
  }

  function bootViewerHook() {
    const viewing = pageWindow.Autodesk?.Viewing
    if (!viewing) {
      return
    }

    patchViewerPrototype(viewing.GuiViewer3D)
    patchViewerPrototype(viewing.Private?.GuiViewer3D)
    scanKnownGlobals()
  }

  function flushPendingState() {
    if (state.persistTimer) {
      persistStateNow()
    }
  }

  restoreState()
  waitForBody()
  pageWindow.addEventListener('pagehide', flushPendingState)
  pageWindow.addEventListener('beforeunload', flushPendingState)
  pageWindow.setInterval(bootViewerHook, 800)
})()
