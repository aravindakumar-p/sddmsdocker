<template>
	<v-button
		v-if="brand && brand?.client_product_mapping?.length > 0"
		:rounded="rounded"
		warning
		x-small
		@click.stop="handleClick()"
	>
		View Brands
	</v-button>
	<div v-else-if="backbutton">{{ value }}</div>

	<v-button v-else :rounded="rounded" secondary x-small disabled>No Brands</v-button>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useApi, useStores } from '@directus/extensions-sdk';
import { useRouterStoreDisplay } from './stores/use-router-store';
import constant from './constant.json'
const api = useApi();

const { useUserStore, usePresetsStore } = useStores();
const userData = useUserStore();
const presetsStore = usePresetsStore();
interface Props {
	display: {
		type: string;
		default: null;
	};
	options: {
		// eslint-disable-next-line @typescript-eslint/ban-types
		type: Object;
		// eslint-disable-next-line @typescript-eslint/ban-types
		default: () => {};
	};
	interface: {
		type: string;
		default: null;
	};
	interfaceOptions: {
		// eslint-disable-next-line @typescript-eslint/ban-types
		type: Object;
		default: null;
	};
	value: {
		// eslint-disable-next-line @typescript-eslint/ban-types
		type: [string, number, Object, boolean];
		default: null;
	};
	type: {
		type: string;
		required: true;
	};
	collection: {
		type: string;
		required: true;
	};
	field: {
		type: string;
		required: true;
	};
	item: {
		// eslint-disable-next-line @typescript-eslint/ban-types
		type: any;
		default: () => null;
	};
	primaryKeyField: {
		// eslint-disable-next-line @typescript-eslint/ban-types
		type: number | string;
	};
	backbutton: {
		type: boolean;
		default: false;
	};
	iconElement: {
		type: string;
		default: '';
	};
	firstChildElement: {
		type: string;
		default: '';
	};
	secondChildElement: {
		type: string;
		default: '';
	};
	thirdChildElement: {
		type: string;
		default: '';
	};
	rounded: {
		type: boolean;
		default: false;
	};
	background: {
		type: string;
		default: null;
	};
}

const props = withDefaults(defineProps<Props>(), {});
const router = useRouter();
const brand: any = ref(null);
const presets: any = ref(null);
const routerStore = useRouterStoreDisplay();

onMounted(async () => {
	const header = document.querySelector('header');
	const firstChild = header?.firstElementChild;
	const check = firstChild?.classList.contains('sd-v-button');
	if (!check && props.backbutton) {
		const divElement = document.createElement('div');
		const myButton = document.createElement('button');
		const iconElement = document.createElement('i');
		const iconSpanFirstChild = document.createElement('span');
		const iconSpanSecondChild = document.createElement('span');
		iconSpanSecondChild.classList.add('v-icon');
		iconSpanSecondChild.setAttribute(props.secondChildElement, '');
		iconSpanSecondChild.setAttribute(props.thirdChildElement, '');
		iconSpanSecondChild.classList.add('content');
		iconSpanFirstChild.setAttribute(props.firstChildElement, '');
		iconElement.setAttribute('data-icon', 'arrow_back');
		iconElement.setAttribute(props.iconElement, '');
		myButton.classList.add('button');
		myButton.classList.add('align-center');
		myButton.classList.add('icon');
		myButton.classList.add('normal');
		divElement.classList.add('v-button');
		divElement.classList.add('sd-v-button');

		divElement.classList.add('rounded');
		divElement.setAttribute('data-v-28d526fe', '');
		divElement.classList.add('header-icon');
		divElement.classList.add('secondary');

		myButton.setAttribute('data-v-28d526fe', '');
		iconSpanSecondChild.appendChild(iconElement);
		iconSpanFirstChild.appendChild(iconSpanSecondChild);

		myButton.appendChild(iconSpanFirstChild);
		divElement.appendChild(myButton);

		// Add a click event listener to the button
		myButton.addEventListener('click', function () {
			router.push(routerStore.gettingPath);
		});
		header?.insertBefore(divElement, header.firstChild);
	}
	if (!props.backbutton) {
		const data = await api.get(`/items/client_product_mapping/${props.item?.id}`);

		const filter = {
			filter: {
				user: {
					_eq: userData.currentUser.id,
				},
				collection: {
					_eq: 'client_brand_commercial',
				},
			},
		};
		const presetsData = await api.get(`/presets`, {
			params: filter,
		});
		if (data.data.data.product == constant.vouchers || data.data.data.product == constant.giftcard) {
			routerStore.postingPath(router.currentRoute.value.fullPath);
			brand.value = data.data.data;
			presets.value = presetsData.data.data;
		}
	}
});
onUnmounted(async () => {
	const elements = document.getElementsByClassName('sd-v-button');

	const elementsArray = Array.from(elements);

	// Remove each element
	elementsArray.forEach(function (element) {
		element.remove();
	});
});

const handleClick = () => {
	if (presets.value[0] && props.item?.id) {
		const patchingData = presets.value[0];
		(patchingData.layout_query = {
			tabular: {
				fields: constant.field.client_brand_commercial,
			},
		}),
			(patchingData.filter = {
				_and: [
					{
						client_product_id: {
							id: {
								_eq: props.item?.id,
							},
						},
					},
				],
			});
		patchingData.search = '';

		const page = {
			last_page: '/content/client_brand_commercial',
		};

		const patching = {
			id: patchingData.id,
			layout: 'sd-tabular',
			user: userData.currentUser.id,
			collection: 'client_brand_commercial',
			filter: {
				_and: [
					{
						client_product_id: {
							id: {
								_eq: props.item?.id,
							},
						},
					},
				],
			},
			layout_query: {
				'sd-tabular': {
					fields: ['flow', 'brand_name', 'discount', 'status'],
				},
			},
		};

		api.patch(`/users/me/track/page`, page).then(async (data) => {
			presetsStore.update(patchingData.id, patching);
			presetsStore.clearLocalSave(patching);
			presetsStore.saveLocal(patching);
			router.push('/content/client_brand_commercial');
		});
	} else {
		const post = {
			layout: 'sd-tabular',
			bookmark: null,
			user: userData.currentUser.id,
			role: null,
			collection: 'client_brand_commercial',
			search: null,
			layout_query: {
				tabular: {
					fields: constant.field.client_brand_commercial,
				},
			},
			layout_options: {
				tabular: {
					widths: {},
				},
			},
			refresh_interval: null,
			filter: {
				_and: [
					{
						client_product_id: {
							id: {
								_eq: props.item?.id,
							},
						},
					},
				],
			},
			icon: 'bookmark_outline',
			color: null,
		};
		const page = {
			last_page: '/content/client_brand_commercial',
		};
		api.patch(`/users/me/track/page`, page).then((data) => {
			presetsStore.create(post);
			presetsStore.clearLocalSave(post);
			presetsStore.saveLocal(post);
			router.push('/content/client_brand_commercial');
		});
	}
};
</script>
