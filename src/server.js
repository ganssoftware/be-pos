const app = require("./app");

const { port } = require("./config/env");

if (require.main === module) {
  app.listen(port, () => {
    console.log(`POS API running on port ${port}`);
  });
}

module.exports = app;