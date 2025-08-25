module.exports = function registerEndpoint(
  router,
  { services, exceptions, database, env }
) {
  const { ItemsService } = services;
  const { ServiceUnavailableException } = exceptions;
  router.get("/", (req, res) => res.send("Hello, World!")),
    router.get("/intro", (req, res) => res.send("Nice to meet you.")),
    router.get("/goodbye", (req, res) => res.send("Goodbye!")),
    router.get("/dashboard", (req, res, next) => {
      const orderPOService = new ItemsService("order_pos", {
        schema: req.schema,
        accountability: req.accountability,
      });

      orderPOService
        .readByQuery({
          fields: ["*"],
          filter: { po_status: { _neq: "cancelled" } },
        })
        .then((results) => {
          results = results || [];
          return res.json(results);
        })
        .catch((error) => {
          return next(new ServiceUnavailableException(error));
        });
    });
};
