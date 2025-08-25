const axios = require("axios");

export default (
  { filter, action },
  { services, exceptions, env, getSchema }
) => {
  const { ItemsService } = services;
  filter("items.update", async (input, { collection }) => {
    switch (collection) {
      case "orders":
        break;
      case "order_pos":
        if (!!input.vendor_payment_utr && input.po_status !== "completed") {
          input.po_status = "processed";
        }
        break;
      default:
        break;
    }
    return input;
  });

  action(
    "items.create",
    async ({ payload, key, collection }, { schema, accountability }) => {
      let url = "";
      let update_item = {};
      update_item.action = "create";
      switch (collection) {
        case "sd_teams":
          url = env.SD_NEW_TEAM_WEBHOOK;
          break;
        case "sd_assignee_details":
          url = env.SD_NEW_ASSIGNEE_WEBHOOK;
          break;
        case "sd_members":
          url = env.SD_NEW_MEMBER;
          break;
        default:
          break;
      }
      if (!!url) {
        axios
          .post(
            url,
            {
              key,
              payload,
              update_item,
            },
            {
              headers: {
                Authorization: `Basic ${env.SD_TOKEN}`,
                "x-SD-Env": env.SD_DEPLOYMENT_ENV,
              },
            }
          )
          .catch(function (error) {
            logError(error, collection, schema, accountability);
          });
      }
    }
  );
  action(
    "items.update",
    async ({ payload, keys, collection }, { schema, accountability }) => {
      let url = "";
      let update_item = [];
      let error_log = {};
      let get_team_id = [];
      let get_assignee_details = [];
      let assignee_trueStatus_details = [];
      const assigneeDetailsService = new ItemsService("sd_assignee_details", {
        schema: schema,
        accountability: accountability,
      });
      const teamsService = new ItemsService("sd_teams", {
        schema: schema,
        accountability: accountability,
      });
      const memberService = new ItemsService("sd_members", {
        schema: schema,
        accountability: accountability,
      });
      const errorLogService = new ItemsService("sd_error_log", {
        schema: schema,
        accountability: accountability,
      });

      switch (collection) {
        case "order_pos":
          url = env.SD_PO_WEBHOOK;
          break;

        case "orders":
          url = env.SD_ORDER_WEBHOOK;
          break;
        case "sdm_approval_request":
          url = env.VEDANTA_ADVANCE_APPROVAL;
          break;
        case "approval_request":
          url = env.SD_APPROVAL_WEBHOOK;
          break;

        case "sd_orders":
          if (payload.order_status) {
            url = env.SD_ROUTING_ORDER_WEBHOOK;
          }
          break;

        case "sd_payment_advise":
          if (payload.payment_advice_file) {
            url = env.SD_ROUTING_GET_PAYMENT_ADVISE;
          } else if (payload.shakedeal_payment) {
            url = env.SD_ROUTING_SHAKEDEAL_PAYMENT;
          }
          break;

        case "sd_vendor_invoice_details":
          if (payload.vendor_invoice) {
            url = env.SD_ROUTING_GET_VENDOR_INVOICE;
          } else if (payload.vendor_payment) {
            url = env.SD_ROUTING_VENDORS_PAYMENT;
          }
          break;

        case "sd_teams":
          if (payload.team_name) {
            url = env.SD_NEW_TEAM_WEBHOOK;
          }
          break;

        case "sd_members":
          if (payload.email) {
            url = env.SD_NEW_MEMBER;
          }
          break;

        case "sd_assignee_details":
          if (payload.team_name || payload.priority || payload.user_id) {
            url = env.SD_NEW_ASSIGNEE_WEBHOOK;
          } else if (payload.status) {
            try {
              get_team_id = await assigneeDetailsService.readByQuery({
                filter: { id: { _eq: parseInt(keys[0]) } },
                fields: ["team_name.id"],
              });
              get_assignee_details = await assigneeDetailsService.readByQuery({
                filter: {
                  team_name: { _eq: get_team_id[0]["team_name"].id },
                },
              });
              //filter the data of get_assignee_details having status true
              assignee_trueStatus_details = get_assignee_details.filter(
                (obj) => obj.status === true
              );
              if (
                assignee_trueStatus_details.length ===
                get_assignee_details.length
              ) {
                get_assignee_details.forEach(async (obj) => {
                  await assigneeDetailsService.updateOne(
                    obj["id"],
					{ status: false }
                  );
                });
              }
            } catch (error) {
              error_log.error = String(error);
              logError(error, collection, schema, accountability);
            }
          }
        default:
          break;
      }

      if (!!url) {
        axios
          .post(
            url,
            {
              keys,
              payload,
            },
            {
              headers: {
                Authorization: `Basic ${env.SD_TOKEN}`,
                "X-SD-Env": env.SD_DEPLOYMENT_ENV,
              },
            }
          )
          .catch(function (error) {
            logError(error, collection, schema, accountability);
          });
      }
    }
  );
  action(
    "items.delete",
    async ({ payload, keys, collection }, { schema, accountability }) => {
      let url = "";
      let update_item = {};
      update_item.action = "delete";
      switch (collection) {
        case "sd_teams":
          url = env.SD_NEW_TEAM_WEBHOOK;
          break;
        case "sd_assignee_details":
          url = env.SD_NEW_ASSIGNEE_WEBHOOK;
          break;
        case "sd_members":
          url = env.SD_NEW_MEMBER;
          break;
      }
      if (!!url) {
        axios
          .post(
            url,
            {
              keys,
              payload,
              update_item,
            },
            {
              headers: {
                Authorization: `Basic ${env.SD_TOKEN}`,
                "x-SD-Env": env.SD_DEPLOYMENT_ENV,
              },
            }
          )
          .catch(function (error) {
            logError(error, collection, schema, accountability);
          });
      }
    }
  );
  function logError(error, collection, schema, accountability) {
    let error_log = {};
    const errorLogService = new ItemsService("sd_error_log", {
      schema: schema,
      accountability: accountability,
    });
    error_log.collection_name = collection;
    error_log.error = String(error);
    errorLogService.createOne(error_log);
  }
};
