/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateSignature } from '@/lib/signature';

// GET /api/inventory?sl_uuid=...&universe=...&category=...&timestamp=...&signature=...
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const sl_uuid = searchParams.get('sl_uuid');
		const universe = searchParams.get('universe');
		const category = searchParams.get('category');
		const timestamp = searchParams.get('timestamp');
		const signature = searchParams.get('signature');

		if (!sl_uuid || !universe || !timestamp || !signature) {
			return NextResponse.json({ success: false, error: 'Missing parameters' }, { status: 400 });
		}

		// Validate signature
		const signatureValidation = validateSignature(timestamp, signature, universe);
		if (!signatureValidation.valid) {
			return NextResponse.json(
				{ success: false, error: signatureValidation.error || 'Unauthorized' },
				{ status: 401 }
			);
		}

		const user = await prisma.user.findFirst({
			where: {
				slUuid: sl_uuid,
				universe: universe
			}
		});
		if (!user) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });

			const inventoryAll = await (prisma as any).userInventory.findMany({
			where: { userId: user.id },
			include: { item: true }
		});

			const filtered = category
				? inventoryAll.filter((inv: any) => inv.item?.category === category)
				: inventoryAll;

			const sorted = filtered.sort((a: any, b: any) => (a.item?.shortName || '').localeCompare(b.item?.shortName || ''));

			const items = sorted.map((inv: any) => ({
			shortName: inv.item!.shortName,
			name: inv.item!.name,
			isShortNameDifferent: inv.item!.isShortNameDifferent,
			category: inv.item!.category,
			quantity: inv.quantity,
			useCount: inv.useCount ?? 0,
			values: { hunger: inv.item!.hungerValue, thirst: inv.item!.thirstValue, health: inv.item!.healthValue },
			edible: inv.item!.edible,
			drinkable: inv.item!.drinkable,
			itemUseCount: inv.item!.useCount ?? 0,
			price: { gold: inv.priceGold, silver: inv.priceSilver, copper: inv.priceCopper }
		}));

		return NextResponse.json({ success: true, data: { sl_uuid, items } });
	} catch (err) {
		console.error('inventory list error', err);
		return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
}

