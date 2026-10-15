// Rassemble toutes les traductions anglaises (un fichier par écran ou composant).
const files = import.meta.glob('./*.js', { eager: true });
const en = {};
for (const [path, mod] of Object.entries(files)) {
  if (!path.endsWith('/index.js')) Object.assign(en, mod.default);
}
export default en;
