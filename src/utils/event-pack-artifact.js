// event-pack-artifact.js — the emitted pack text as an ARTIFACT FOLDER mvu-helper can install.
//
// WHY IT EXISTS. The Event Packs tab used to hand out one .txt to paste into mvu-helper's tab by
// hand. That is fine for a finished pack and useless while writing one: every other artifact type
// (GameLogic Pack, StatusMenu Pack, plugin) ships as a folder with a `pack.json`, which is what the
// dev loop watches and what the Packs tab imports as a zip. An event pack that ships only loose text
// is the one artifact a developer cannot iterate on.
//
// SHAPE (mvu-helper's artifact source format §28):
//   pack.json          identity — packType "eventpack", plus the fields rule 1 requires
//   events/<id>.txt    the pack text, verbatim, exactly as the Download button already produces it
//
// ONE ARTIFACT IS ONE PACK. The format caps a pack at 20 trigger rows, so a long route is authored as
// several packs — mitsuki-route-1, mitsuki-route-2 — that chain by prereq, and each is its own folder
// with its own version. Nothing here merges them: an artifact holding two routes would upgrade both
// on one version bump, and a developer editing one would re-install the other.
//
// PURE — text in, members out. No DOM, no zip encoding (`stored-zip.js` owns that), no download.

/**
 * mvu-helper's id shape: lowercase letters/digits in single-hyphen runs (its `isKebabCaseId`, which
 * rides lorebook needles, CSS scopes and locale keys). An event pack's own identity is
 * `slug(creator).slug(event)` — dots and underscores are legal there and not here — so it is
 * converted rather than passed through, and the ONE conversion lives here.
 *
 * @param {string} packId e.g. "demo.mitsukielementary"
 * @returns {string} e.g. "demo-mitsukielementary", '' when nothing legal survives
 */
export function artifactIdFromPackId(packId) {
    return String(packId || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * The artifact's two members for one emitted pack.
 *
 * @param {object} input
 * @param {string} input.text the pack text (emitPack's output), carried verbatim
 * @param {string} input.packId the pack's own identity, `slug(creator).slug(event)`
 * @param {string} input.version the pack's version, mirrored so the dev loop's upgrade compare works
 * @param {string} [input.eventName] the display half of the identity, for the artifact's name
 * @param {string} [input.builtWith] the stamp the emitter already writes into the pack
 * @returns {{ folder: string, members: Array<{path: string, text: string}>, errors: string[] }}
 */
export function eventPackArtifactMembers({ text, packId, version, eventName = '', builtWith = '' } = {}) {
    const errors = [];
    const id = artifactIdFromPackId(packId);
    if (typeof text !== 'string' || !text.trim()) errors.push('there is no pack text to ship — generate the pack first');
    if (!id) errors.push('the pack id "' + String(packId) + '" contains nothing mvu-helper can use as an artifact id (it must reduce to lowercase letters and digits)');
    if (errors.length) return { folder: '', members: [], errors };

    // `name` and `description` are REQUIRED by rule 1 and shown in the library list and install
    // dialog, so neither may be blank. Both are derived from what the author already typed rather
    // than asked for again — a second field for the same fact is a second thing to keep in step.
    const display = String(eventName || packId);
    const pack = {
        format: '1.0',
        packType: 'eventpack',
        id,
        name: display,
        description: 'Event pack "' + display + '" — ' + (version ? 'v' + version : 'unversioned') + '.',
        version: String(version || '1.0'),
    };
    if (builtWith) pack.builtWith = String(builtWith);

    return {
        folder: id,
        members: [
            { path: 'pack.json', text: JSON.stringify(pack, null, 2) + '\n' },
            // The file keeps the name the plain Download already gives it, so the two lanes produce
            // the same bytes under the same name and a developer can tell at a glance that the folder
            // holds the pack they just downloaded.
            { path: 'events/' + id + '-event-pack.txt', text },
        ],
        errors: [],
    };
}
