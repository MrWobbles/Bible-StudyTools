const DiffMatchPatch = require('diff-match-patch');

// A full snapshot is stored every SNAPSHOT_INTERVAL versions; the rest are patches.
const SNAPSHOT_INTERVAL = 5;

const dmp = new DiffMatchPatch();

function isSnapshotSeq(seq) {
  return seq % SNAPSHOT_INTERVAL === 0;
}

function getSnapshotSeq(seq) {
  return seq - (seq % SNAPSHOT_INTERVAL);
}

function makePatch(previousText, nextText) {
  return dmp.patch_toText(dmp.patch_make(previousText, nextText));
}

function applyPatch(text, patchText) {
  const [result, applied] = dmp.patch_apply(dmp.patch_fromText(patchText), text);
  if (applied.some(ok => !ok)) {
    throw new Error('Version patch could not be applied cleanly.');
  }
  return result;
}

// rows: version rows from the nearest snapshot up to the target seq, in any order.
function rebuildFromRows(rows, targetSeq) {
  const ordered = [...rows].sort((a, b) => a.seq - b.seq);
  const base = ordered[0];
  if (!base || base.seq !== getSnapshotSeq(targetSeq) || base.kind !== 'snapshot') return null;
  if (ordered.length !== targetSeq - base.seq + 1) return null;

  let text = base.body;
  for (const row of ordered.slice(1)) {
    text = applyPatch(text, row.body);
  }
  return text;
}

module.exports = {
  SNAPSHOT_INTERVAL,
  isSnapshotSeq,
  getSnapshotSeq,
  makePatch,
  applyPatch,
  rebuildFromRows
};
