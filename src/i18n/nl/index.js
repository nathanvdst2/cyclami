// Rassemble toutes les traductions néerlandaises (un fichier par écran ou composant).
const files = import.meta.glob('./*.js', { eager: true });
const nl = {};
for (const [path, mod] of Object.entries(files)) {
  if (!path.endsWith('/index.js')) Object.assign(nl, mod.default);
}
export default nl;
