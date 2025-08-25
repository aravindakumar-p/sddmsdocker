import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './interface.vue';

export default defineInterface({
	id: 'sd-csv-json-interface',
	name: 'SD CSV to JSON Interface',
	description: 'CSV to JSON and Checking',
	icon: 'arrow_drop_down_circle',
	component: InterfaceComponent,
	types: ['alias'],
	localTypes: ['presentation'],
	group: 'presentation',
	options: () => {
		return [
			{
				field: 'flowid',
				name: 'Flow Id',
				type: 'string',
				meta: {
					width: 'full',
					interface: 'input',
				},
			},
			{
				field: 'confirm',
				name: 'Confirm Button',
				type: 'string',
				meta: {
					width: 'full',
					interface: 'input',
				},
			}
		];
	},
	recommendedDisplays: ['labels'],
});
