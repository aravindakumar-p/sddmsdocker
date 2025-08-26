import { defineDisplay } from '@directus/extensions-sdk';
import DisplayComponent from './display.vue';

export default defineDisplay({
	id: 'sd-qr-display',
	name: 'SD QR Generate',
	icon: 'box',
	description: 'QR Generating Display!',
	component: DisplayComponent,
    options: [
        {
            field: 'size',
            name: 'QR Size',
            type: 'number',
            meta: {
                width: 'full',
                interface: 'input-text'
            }
        }
    ],
	types: ['string', 'text'],
});
