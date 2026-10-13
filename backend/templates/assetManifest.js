const ASSET_ID = /^(image|document)-([0-9a-f]{64})$/;

function buildAssetManifest(template, existing = []) {
  if (!template || typeof template !== 'object') return Array.isArray(existing) ? existing : [];
  const refs = new Map();
  const add = (assetId, role, pageNumber = null, details = {}) => {
    const match = typeof assetId === 'string' && assetId.match(ASSET_ID);
    if (!match) return;
    const old = (Array.isArray(existing) ? existing : []).find(asset => asset?.asset_id === assetId) || {};
    refs.set(assetId, {
      ...old, ...details, asset_id: assetId, sha256: match[2], kind: match[1], role,
      ...(pageNumber == null ? {} : { page_number: Number(pageNumber) }),
      transfer: 'reference_only', local_availability: old.local_availability || 'not_verified',
      fallback: 'keep_exam_content_and_use_basic_layout_when_asset_is_missing'
    });
  };
  const background = template.appearance?.background || {};
  add(background.source_asset_id, 'source_document');
  add(background.asset_id, 'page_background');
  for (const page of Array.isArray(background.pages) ? background.pages : []) add(page?.asset_id, 'page_background', page?.page_number, page);
  for (const section of Array.isArray(template.sections) ? template.sections : []) for (const slot of Array.isArray(section?.slots) ? section.slots : []) {
    for (const asset of Array.isArray(slot?.assets) ? slot.assets : []) add(typeof asset === 'string' ? asset : asset?.asset_id, 'question_illustration', null, typeof asset === 'object' ? asset : {});
  }
  return refs.size ? [...refs.values()].sort((a, b) => a.asset_id.localeCompare(b.asset_id)) : (Array.isArray(existing) ? existing : []);
}

module.exports = { buildAssetManifest };
