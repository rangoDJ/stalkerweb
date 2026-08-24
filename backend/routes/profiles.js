// routes/profiles.js
// GET    /api/profiles           — { profiles, activeProfileId }
// POST   /api/profiles           — create a profile, returns it
// PUT    /api/profiles/:id       — update a profile, returns it
// DELETE /api/profiles/:id       — delete a profile
// PUT    /api/profiles/active    — { id } set the active profile (id may be null)

'use strict';

const express = require('express');

module.exports = function profilesModule(profilesManager) {
  const router = express.Router();

  router.get('/', (_req, res) => {
    res.json(profilesManager.list());
  });

  router.post('/', (req, res) => {
    const body = req.body || {};
    if (!body.portal) return res.status(400).json({ error: 'portal is required' });
    if (!body.mac)    return res.status(400).json({ error: 'mac is required' });
    res.json(profilesManager.create(body));
  });

  router.put('/active', (req, res) => {
    const { id } = req.body || {};
    const ok = profilesManager.setActive(id || null);
    if (!ok) return res.status(404).json({ error: 'profile not found' });
    res.json({ success: true, activeProfileId: id || null });
  });

  router.put('/:id', (req, res) => {
    const updated = profilesManager.update(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'profile not found' });
    res.json(updated);
  });

  router.delete('/:id', (req, res) => {
    const ok = profilesManager.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: 'profile not found' });
    res.json({ success: true });
  });

  return router;
};
