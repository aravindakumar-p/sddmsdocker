import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './interface.vue';

export default defineInterface({
	id: 'sd-calculation-poc-transfer-interface',
	name: 'SD Calculation POC Transfer Interface',
	description: 'CSV to JSON and Checking',
	icon: 'arrow_drop_down_circle',
	component: InterfaceComponent,
	types: ['string','text'],
	group: 'other',
	options: () => {
		return [];
	},
	recommendedDisplays: ['labels'],
});
