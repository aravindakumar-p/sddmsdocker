import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './interface.vue';

export default defineInterface({
	id: 'sd-masked-interface',
	name: 'SD Masked Interface',
	description: 'Masked Display for Interface',
	icon: 'arrow_drop_down_circle',
	component: InterfaceComponent,
	types: ['string', 'uuid', 'bigInteger', 'integer', 'float', 'decimal', 'text'],
	group: 'standard',
	options: () => {
		const data = [
			{
				field: 'frontOffset',
				name: 'Front Mask Length',
				type: 'number',
				meta: {
					interface: 'input',
					width: 'half',
				},
		
			},
			{
				field: 'backOffset',
				name: 'Back Mask Length',
				type: 'number',
				meta: {
					interface: 'input',
					width: 'half',
				},
			},
			{
				field: 'roleid',
				name: 'role',
				type: 'string',
				meta: {
					interface: 'input',
					width: 'half',
				},
				
			}
		];

		return data;
	},
	recommendedDisplays: ['labels'],
});
