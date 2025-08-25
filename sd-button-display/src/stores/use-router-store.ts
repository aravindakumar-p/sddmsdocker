import { defineStore } from 'pinia';
export const useRouterStoreDisplay = defineStore({
	id: 'routerStore',
	state: () => ({
		path: '/content/client_product_mapping?bookmark=1502' as string,
	}),
	getters: {
		gettingPath(): string {
			return this.path;
		},
	},
	actions: {
		postingPath(value: string) {
			this.path = value;
		},
	},
});
