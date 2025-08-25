import { defineDisplay } from '@directus/shared/utils';
import DisplayComponent from './display.vue';

export default defineDisplay({
	id: 'sd-coins-cpp-currency',
	name: 'SD Currency',
	description: 'Select Currency',
	icon: 'box',
	component: DisplayComponent,
	options: [
		{
			field: 'currency',
			type: 'string',
			name: 'Currency',
			meta: {
				interface: 'select-dropdown',
				options: {
					choices: [
						{
							text: 'INR',
							value: 'inr',
							disabled: false,
						},
						{
							text: 'USD',
							value: 'usd',
							disabled: false,
						},
					],
				},
				width: 'half',
			},
		},
	],
	types: ['bigInteger', 'float', 'integer', 'decimal'],
});
