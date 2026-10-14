/**
 * Haftarah drop box: a Google Apps Script web app that writes files into
 * Daniel's Drive so a cloud session can deliver the week's sheet byte-exact.
 *
 * Deploy once (see SETUP.md): Execute as Me, Who has access Anyone.
 * Every request must carry the TOKEN set in Script Properties.
 *
 * Script Properties
 *   TOKEN              required; requests without it are refused
 *   PUBLIC_FOLDER_ID   default 1TbSmoeBaCSLciL_-_HSCuKWkJMSZvGwd  (Haftarah)
 *   WORKING_FOLDER_ID  default 1BamL1Odk8xP5znSIRr3ENc2nt7QRo7ti  (Haftarah working)
 *
 * POST body (JSON): {token, target: "public"|"working", slug, name, mimeType, base64}
 *   slug is required for "working": the file goes into a subfolder of that name.
 *   A file with the same name already in the folder is trashed and replaced.
 *   Reply: {ok, id, name, url, size, sha256, folderId, folderUrl}
 * GET ?token=...  health check: {ok, publicFolder, workingFolder}
 * Errors: {ok:false, error}
 */

var DEFAULT_PUBLIC_FOLDER_ID = '1TbSmoeBaCSLciL_-_HSCuKWkJMSZvGwd';
var DEFAULT_WORKING_FOLDER_ID = '1BamL1Odk8xP5znSIRr3ENc2nt7QRo7ti';

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fail_(message) {
  return json_({ ok: false, error: message });
}

function props_() {
  var p = PropertiesService.getScriptProperties();
  return {
    token: p.getProperty('TOKEN') || '',
    publicId: p.getProperty('PUBLIC_FOLDER_ID') || DEFAULT_PUBLIC_FOLDER_ID,
    workingId: p.getProperty('WORKING_FOLDER_ID') || DEFAULT_WORKING_FOLDER_ID
  };
}

// Compare without stopping at the first differing character.
function tokenOk_(given, expected) {
  if (!expected || typeof given !== 'string' || given.length !== expected.length) return false;
  var diff = 0;
  for (var i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function hex_(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    out += (b < 16 ? '0' : '') + b.toString(16);
  }
  return out;
}

function findOrCreateFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

function doGet(e) {
  var cfg = props_();
  var token = e && e.parameter ? e.parameter.token : '';
  if (!tokenOk_(token, cfg.token)) return fail_('unauthorized');
  try {
    return json_({
      ok: true,
      publicFolder: DriveApp.getFolderById(cfg.publicId).getName(),
      workingFolder: DriveApp.getFolderById(cfg.workingId).getName()
    });
  } catch (err) {
    return fail_('folder not reachable: ' + err.message);
  }
}

function doPost(e) {
  var cfg = props_();
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return fail_('body is not JSON');
  }
  if (!tokenOk_(body.token, cfg.token)) return fail_('unauthorized');

  var target = body.target;
  if (target !== 'public' && target !== 'working') return fail_('target must be "public" or "working"');
  var name = String(body.name || '').trim();
  if (!name || /[\/\\]/.test(name)) return fail_('name is missing or contains a slash');
  if (typeof body.base64 !== 'string') return fail_('base64 is missing');
  var slug = String(body.slug || '').trim();
  if (target === 'working' && (!slug || /[\/\\]/.test(slug))) return fail_('slug is required for "working" and may not contain a slash');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return fail_('busy; try again');
  try {
    var folder = target === 'public'
      ? DriveApp.getFolderById(cfg.publicId)
      : findOrCreateFolder_(DriveApp.getFolderById(cfg.workingId), slug);

    var bytes = Utilities.base64Decode(body.base64);
    var blob = Utilities.newBlob(bytes, body.mimeType || 'application/octet-stream', name);

    var old = folder.getFilesByName(name);
    while (old.hasNext()) old.next().setTrashed(true);

    var file = folder.createFile(blob);
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);

    return json_({
      ok: true,
      id: file.getId(),
      name: file.getName(),
      url: file.getUrl(),
      size: bytes.length,
      sha256: hex_(digest),
      folderId: folder.getId(),
      folderUrl: folder.getUrl()
    });
  } catch (err) {
    return fail_('drive error: ' + err.message);
  } finally {
    lock.releaseLock();
  }
}
