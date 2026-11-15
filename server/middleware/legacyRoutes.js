const { LESSON_PLANS_SEGMENT, LEGACY_LESSON_PLANS_SEGMENT } = require('../config/env');

function isLegacyLessonPlansPath(reqPath) {
  return String(reqPath || '').toLowerCase().includes(`/${LEGACY_LESSON_PLANS_SEGMENT}`);
}

function markLegacyLessonPlansRoute(req, res, next) {
  if (isLegacyLessonPlansPath(req.path)) {
    const successorPath = req.path.replace(`/${LEGACY_LESSON_PLANS_SEGMENT}`, `/${LESSON_PLANS_SEGMENT}`);
    res.set('Deprecation', 'true');
    res.set('Link', `<${successorPath}>; rel="successor-version"`);
  }
  next();
}

module.exports = {
  isLegacyLessonPlansPath,
  markLegacyLessonPlansRoute
};
