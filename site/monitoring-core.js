(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MonitoringCore = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  // Lands Department 7P_ITRF96_HK80_V1.0 uses coordinate-frame rotations.
  // Proj4 towgs84 uses position-vector rotations: negate the three rotations.
  // Official check: E=818097.267, N=838477.970 -> 22°29'8.777176", 114°00'1.079932".
  const HK1980_DEFINITION = '+proj=tmerc +lat_0=22.3121333333333 +lon_0=114.178555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +ellps=intl +towgs84=-162.619,-276.959,-161.764,0.067753,-2.243648,-1.158828,-1.094246 +units=m +no_defs +type=crs';

  function finiteNumber(value) {
    return (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value));
  }

  function isoDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function settlement(point, record) {
    if (!point || !record || !finiteNumber(point.baseline) || !finiteNumber(record.reading)) return NaN;
    const millimetres = (Number(record.reading) - Number(point.baseline)) * 1000;
    // Decimal mPD subtraction can place an exact half tenth just below its binary value.
    // Use an insignificant scaled tolerance and an explicit half-away-from-zero rule.
    const rounded = Math.sign(millimetres) * Math.round(Math.abs(millimetres) * 10 + 1e-9) / 10;
    return Object.is(rounded, -0) ? 0 : rounded;
  }

  function extent(values) {
    let min = Infinity; let max = -Infinity;
    for (const value of values) { min = Math.min(min, value); max = Math.max(max, value); }
    return { min, max };
  }

  // Operational resource limits, not engineering accuracy/coordinate limits.
  const MAX_IMAGE_DIMENSION = 8192;
  const MAX_IMAGE_PIXELS = 16_000_000;
  const MAX_EXPORT_DIMENSION = 4096;
  const MAX_EXPORT_PIXELS = 4_000_000;
  function validateImageDimensions(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error('Layout image dimensions must be positive integers.');
    if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) throw new Error('Layout image exceeds the resource limit: maximum 8192 pixels per side and 16 megapixels. Resize a copy before upload; retain the original separately.');
    return { width, height };
  }

  // Bounded PNG/JPEG header inspection before browser pixel decoding.
  // Not a full decoder: corrupt pixel data must still be rejected by the browser.
  function imageDimensions(bytes) {
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > 12 * 1024 * 1024) throw new Error('Layout image must be between 1 byte and 12 MB.');
    const png = [137, 80, 78, 71, 13, 10, 26, 10];
    if (png.every((value, index) => bytes[index] === value)) {
      if (bytes.length < 33 || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR' || bytes.slice(8, 12).some((value, index) => value !== [0, 0, 0, 13][index])) throw new Error('PNG image header is missing or corrupted.');
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return validateImageDimensions(view.getUint32(16), view.getUint32(20));
    }
    if (bytes[0] === 255 && bytes[1] === 216) {
      let offset = 2;
      while (offset < bytes.length) {
        if (bytes[offset++] !== 255) break;
        while (bytes[offset] === 255) offset++;
        const marker = bytes[offset++];
        if (marker === 217 || marker === 218) break;
        if (marker === 216 || marker === 1 || (marker >= 208 && marker <= 215)) continue;
        if (offset + 2 > bytes.length) break;
        const length = bytes[offset] * 256 + bytes[offset + 1];
        if (length < 2 || offset + length > bytes.length) break;
        if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker)) {
          if (length < 8) break;
          return validateImageDimensions(bytes[offset + 5] * 256 + bytes[offset + 6], bytes[offset + 3] * 256 + bytes[offset + 4]);
        }
        offset += length;
      }
      throw new Error('JPEG image dimensions are missing or corrupted.');
    }
    throw new Error('Use a valid PNG or JPEG image.');
  }

  function imageDimensionsFromDataUrl(dataUrl) {
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl));
    if (!match || match[2].length > 16 * 1024 * 1024) throw new Error('Layout image data is invalid or exceeds 12 MB.');
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return imageDimensions(bytes);
  }

  function boundedImageExport(width, height, footer = 190) {
    validateImageDimensions(width, height);
    if (!Number.isInteger(footer) || footer < 0 || footer > 1000) throw new Error('Export footer must be an integer between 0 and 1000 pixels.');
    const scale = Math.min(1, MAX_EXPORT_DIMENSION / width, MAX_EXPORT_DIMENSION / (height + footer), Math.sqrt(MAX_EXPORT_PIXELS / (width * (height + footer))));
    return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor((height + footer) * scale)), scale };
  }

  function csvExportCell(value, text = true) {
    let cell = String(value ?? '');
    // Apostrophe forces spreadsheet text; original stored values are unchanged.
    if ((text || !finiteNumber(value)) && /^[\s\u0000-\u0020\u007f-\u009f]*[=+\-@\uff1d\uff0b\uff0d\uff20]/u.test(cell)) cell = "'" + cell;
    return '"' + cell.replaceAll('"', '""') + '"';
  }

  function validateState(state) {
    const fail = message => { throw new Error(message); };
    if (!state || !Array.isArray(state.points) || !Array.isArray(state.records)) fail('State needs points and records arrays.');
    if (state.thresholdSettings !== undefined && (!state.thresholdSettings || typeof state.thresholdSettings !== 'object' || Array.isArray(state.thresholdSettings))) fail('Threshold settings must be an object, not null or a reset to defaults.');
    const ids = new Set();
    for (const point of state.points) {
      if (!point || typeof point.id !== 'string' || !point.id.trim() || !finiteNumber(point.baseline)) fail('Every marker needs an ID and a finite initial level.');
      if (!['ground', 'utilities', 'refuseGround'].includes(point.rule) || (state.thresholdSettings != null && !Object.hasOwn(state.thresholdSettings, point.rule))) fail('Every marker must reference an available threshold rule.');
      if (ids.has(point.id.toLowerCase())) fail('Duplicate marker ID: ' + point.id);
      ids.add(point.id.toLowerCase());
      for (const key of ['easting', 'northing', 'lat', 'lng']) {
        if (point[key] != null && point[key] !== '' && !finiteNumber(point[key])) fail('Invalid marker coordinate: ' + key);
      }
      if (finiteNumber(point.lat) && Math.abs(Number(point.lat)) > 90) fail('Latitude must be between -90 and 90.');
      if (finiteNumber(point.lng) && Math.abs(Number(point.lng)) > 180) fail('Longitude must be between -180 and 180.');
    }
    const exactIds = new Map(state.points.map(point => [point.id, point]));
    const keys = new Set();
    for (const record of state.records) {
      if (!record || !exactIds.has(record.pointId) || !isoDate(record.date) || !finiteNumber(record.reading)) fail('Each reading needs a known marker, a valid YYYY-MM-DD date and a finite level.');
      if (!Number.isFinite(settlement(exactIds.get(record.pointId), record))) fail('A settlement calculation overflowed. Check the initial and measured levels.');
      const key = JSON.stringify([record.pointId, record.date]);
      if (keys.has(key)) fail('Duplicate monitoring record: ' + record.pointId + ' on ' + record.date);
      keys.add(key);
    }
    for (const name of ['contacts', 'reminderRules', 'reminderLog', 'followupEvents', 'layoutPlans', 'layoutPoints']) {
      if (state[name] !== undefined && (!Array.isArray(state[name]) || state[name].some(item => !item || typeof item !== 'object' || Array.isArray(item)))) fail(name + ' must contain valid objects.');
    }
    if (state.contourDxf != null) {
      const drawing = state.contourDxf;
      if (!drawing || typeof drawing !== 'object' || Array.isArray(drawing)
          || typeof drawing.id !== 'string' || !drawing.id
          || typeof drawing.originalFileName !== 'string' || !/\.dxf$/i.test(drawing.originalFileName)
          || typeof drawing.content !== 'string' || !drawing.content.length || drawing.content.length > 1_000_000 || /\0/.test(drawing.content)
          || /[^\x09\x0a\x0d\x20-\x7e]/.test(drawing.content)
          || drawing.crs !== 'EPSG:2326' || drawing.units !== 'm'
          || !Array.isArray(drawing.selectedLayers) || drawing.selectedLayers.some(layer => typeof layer !== 'string' || !layer)
          || ['drawingTitle', 'drawingNumber', 'revision'].some(name => drawing[name] != null && (typeof drawing[name] !== 'string' || drawing[name].length > ({ drawingTitle: 160, drawingNumber: 80, revision: 40 })[name]))
          || typeof drawing.createdAt !== 'string' || !Number.isFinite(new Date(drawing.createdAt).getTime())) fail('Contour DXF must be a bounded ASCII HK1980-metre drawing.');
    }
    const planIds = new Set();
    for (const plan of state.layoutPlans || []) {
      if (typeof plan.id !== 'string' || !plan.id || planIds.has(plan.id) || !['pdf', 'png', 'jpg', 'jpeg'].includes(plan.fileType)
          || !Number.isFinite(plan.originalWidth) || plan.originalWidth <= 0 || !Number.isFinite(plan.originalHeight) || plan.originalHeight <= 0
          || typeof plan.fileUrl !== 'string' || !(/^(\/uploads\/[a-f0-9-]+\.(pdf|png|jpg|jpeg)|data:(image\/(png|jpeg)|application\/pdf);base64,[A-Za-z0-9+/=]+)$/i.test(plan.fileUrl))) fail('Invalid layout plan ID, dimensions, type or original-file reference.');
      planIds.add(plan.id);
      // Keep unchanged historical metadata saveable. Resource budgets apply to
      // new/changed sources on the server and before any decode/export, not to
      // unrelated monitoring edits carrying a legacy oversized/unsupported plan.
    }
    const layoutIds = new Set(); const layoutNames = new Set();
    for (const point of state.layoutPoints || []) {
      const key = JSON.stringify([point.layoutPlanId, String(point.pointId || '').trim().toLowerCase()]);
      if (!point.id || layoutIds.has(point.id) || !planIds.has(point.layoutPlanId) || !String(point.pointId || '').trim() || layoutNames.has(key)
          || !['ground_settlement', 'building_settlement', 'utility', 'tilting', 'vibration', 'standpipe', 'piezometer', 'survey_control'].includes(point.pointType)
          || !['proposed', 'installed', 'inactive', 'removed'].includes(point.installationStatus)
          || ['relativeX', 'relativeY'].some(name => !Number.isFinite(point[name]) || point[name] < 0 || point[name] > 1)) fail('Layout points need unique IDs, valid types/statuses and relative positions between 0 and 1.');
      layoutIds.add(point.id); layoutNames.add(key);
    }
    const contactIds = new Set();
    for (const contact of state.contacts || []) {
      if (typeof contact.id !== 'string' || !contact.id || contactIds.has(contact.id) || typeof contact.name !== 'string' || !contact.name.trim() || typeof contact.email !== 'string' || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(contact.email)) fail('Contacts need unique IDs, names and a single valid email address.');
      contactIds.add(contact.id);
      if (typeof contact.active !== 'boolean' || typeof contact.isSignatory !== 'boolean') fail('Contact flags must be true or false.');
    }
    const ruleIds = new Set();
    for (const rule of state.reminderRules || []) {
      const allowed = rule.approach === '3A' ? ['alert', 'alarm', 'action'] : rule.approach === '5A' ? ['alert', 'alarm', 'action1', 'action2', 'action3'] : [];
      if (!rule.id || ruleIds.has(rule.id) || !allowed.includes(rule.levelKey) || typeof rule.enabled !== 'boolean' || !Array.isArray(rule.contactIds) || rule.contactIds.some(id => !contactIds.has(id))) fail('Invalid reminder rule or recipient.');
      ruleIds.add(rule.id);
    }
    const followupIds = new Set();
    const followupReferences = new Set();
    const followupStatuses = ['open', 'acknowledged', 'in_progress', 'closed'];
    for (const event of state.followupEvents || []) {
      if (typeof event.id !== 'string' || !event.id || followupIds.has(event.id) || !exactIds.has(event.pointId)
          || !followupStatuses.includes(event.status) || typeof event.createdAt !== 'string' || !Number.isFinite(Date.parse(event.createdAt))
          || !event.trigger || !isoDate(event.trigger.recordDate) || !finiteNumber(event.trigger.reading)
          || !finiteNumber(event.trigger.accumulatedSettlement) || !Array.isArray(event.observations) || !event.observations.length
          || event.observations.some(observation => !observation || !isoDate(observation.recordDate) || !finiteNumber(observation.reading) || !finiteNumber(observation.accumulatedSettlement))
          || !Array.isArray(event.activity) || event.activity.some(entry => !entry || typeof entry.type !== 'string' || typeof entry.at !== 'string' || !Number.isFinite(Date.parse(entry.at)))) {
        fail('Follow-up events need unique IDs, known markers, valid snapshots, statuses and activity history.');
      }
      if (event.dueDate && !isoDate(event.dueDate)) fail('Follow-up due dates must use YYYY-MM-DD.');
      if (event.reference !== undefined && (!/^EVT-\d{8}-\d{3,}$/.test(event.reference) || followupReferences.has(event.reference))) fail('Follow-up references must be unique project-scoped event numbers.');
      if (event.reference) followupReferences.add(event.reference);
      if (event.evidenceFiles !== undefined && (!Array.isArray(event.evidenceFiles) || event.evidenceFiles.some(file => !file || !/^[a-f0-9-]{36}$/.test(file.id) || !/^[a-f0-9-]{36}\.(pdf|png|jpg|jpeg)$/.test(file.storedName) || !['application/pdf', 'image/png', 'image/jpeg'].includes(file.mimeType)))) fail('Follow-up evidence metadata is invalid.');
      followupIds.add(event.id);
    }
    if (state.monitoringApproach !== undefined && !['3A', '5A'].includes(state.monitoringApproach)) fail('Monitoring approach must be 3A or 5A.');
    if (state.thresholdSettings != null) {
      if (typeof state.thresholdSettings !== 'object' || Array.isArray(state.thresholdSettings)) fail('Invalid threshold settings.');
      const levels = state.monitoringApproach === '5A' ? ['alert', 'alarm', 'action1', 'action2', 'action3'] : ['alert', 'alarm', 'action'];
      for (const limits of Object.values(state.thresholdSettings)) {
        if (!limits || levels.some((key, index) => !finiteNumber(limits[key]) || Number(limits[key]) < 0 || (index > 0 && Number(limits[key]) <= Number(limits[levels[index - 1]])))) fail('Active threshold levels must be finite, non-negative and strictly increasing.');
      }
    }
    return state;
  }

  return { HK1980_DEFINITION, finiteNumber, isoDate, settlement, extent, validateState, csvExportCell,
    MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS, MAX_EXPORT_DIMENSION, MAX_EXPORT_PIXELS,
    validateImageDimensions, imageDimensions, imageDimensionsFromDataUrl, boundedImageExport };
});
