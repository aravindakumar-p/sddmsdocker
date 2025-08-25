var e = function (e, t, n, o, i, s, r, l, d, a) {
  "boolean" != typeof r && ((d = l), (l = r), (r = !1));
  var c,
    _ = "function" == typeof n ? n.options : n;
  if (
    (e &&
      e.render &&
      ((_.render = e.render),
      (_.staticRenderFns = e.staticRenderFns),
      (_._compiled = !0),
      i && (_.functional = !0)),
    o && (_._scopeId = o),
    s
      ? ((c = function (e) {
          (e =
            e ||
            (this.$vnode && this.$vnode.ssrContext) ||
            (this.parent &&
              this.parent.$vnode &&
              this.parent.$vnode.ssrContext)) ||
            "undefined" == typeof __VUE_SSR_CONTEXT__ ||
            (e = __VUE_SSR_CONTEXT__),
            t && t.call(this, d(e)),
            e && e._registeredComponents && e._registeredComponents.add(s);
        }),
        (_._ssrRegister = c))
      : t &&
        (c = r
          ? function () {
              t.call(this, a(this.$root.$options.shadowRoot));
            }
          : function (e) {
              t.call(this, l(e));
            }),
    c)
  )
    if (_.functional) {
      var f = _.render;
      _.render = function (e, t) {
        return c.call(t), f(e, t);
      };
    } else {
      var u = _.beforeCreate;
      _.beforeCreate = u ? [].concat(u, c) : [c];
    }
  return n;
};
const t = {
  data: () => ({ collections: null }),
  methods: {
    logToConsole: function () {
      console.log(this.collections);
    },
  },
  inject: ["system"],
  mounted() {
    console.log(this.system),
      this.system.api.get("/items/order_pos?limit=-1").then((e) => {
        this.collections = e.data.data;
      });
  },
};
var n = function () {
  var e = this,
    t = e.$createElement,
    n = e._self._c || t;
  return n(
    "private-view",
    { attrs: { title: "Example Collection List" } },
    [
      n(
        "v-list",
        e._l(e.collections, function (t) {
          return n("v-list-item", { key: t.id }, [
            e._v("\n      " + e._s(t.id) + "\n    "),
          ]);
        }),
        1
      ),
      e._v(" "),
      n("v-button", { on: { click: e.logToConsole } }, [
        e._v("Log collections to console"),
      ]),
    ],
    1
  );
};
n._withStripped = !0;
var o = {
  id: "dashboard",
  name: "Dashboard",
  icon: "box",
  routes: [
    {
      path: "/",
      component: e(
        { render: n, staticRenderFns: [] },
        undefined,
        t,
        undefined,
        false,
        undefined,
        !1,
        void 0,
        void 0,
        void 0
      ),
    },
  ],
};
export default o;
