const express = require('express');
const router = express.Router();

// GET api/dashboard
router.get('/', (req, res) => {
  // Example data for demonstration
  const dashboardData = [
    { id: 1, title: 'Task 1', description: 'Complete task 1' },
    { id: 2, title: 'Task 2', description: 'Complete task 2' },
  ];

  res.json(dashboardData);
});

module.exports = router;
