import { useState, useEffect, useMemo } from "react";
import { documentApi } from "../services/documentApi";

/**
 * 원문 id마다, 현재 사용자의 복사본이 번역 중(IN_TRANSLATION)인지 조회.
 * 목록이 접혀 있어도 복사본 전체를 펼치지 않고 배지 표시용으로 사용.
 */
export function useMyInTranslationBySourceId(
	sources: readonly { id: number }[],
	userId: number | undefined,
): Map<number, boolean> {
	const [map, setMap] = useState<Map<number, boolean>>(() => new Map());

	const key = useMemo(
		() =>
			[...sources]
				.map((d) => d.id)
				.sort((a, b) => a - b)
				.join(","),
		[sources],
	);

	useEffect(() => {
		if (userId == null || !key) {
			setMap(new Map());
			return;
		}
		const ids = key
			.split(",")
			.map((s) => Number.parseInt(s, 10))
			.filter((n) => !Number.isNaN(n));
		if (ids.length === 0) {
			setMap(new Map());
			return;
		}
		let cancelled = false;
		(async () => {
			const entries = await Promise.all(
				ids.map(async (sourceId) => {
					try {
						const mine = await documentApi.getMyCopyBySourceId(sourceId);
						const active =
							mine != null && mine.status === "IN_TRANSLATION";
						return [sourceId, active] as const;
					} catch {
						return [sourceId, false] as const;
					}
				}),
			);
			if (cancelled) return;
			setMap(new Map(entries));
		})();
		return () => {
			cancelled = true;
		};
	}, [userId, key]);

	return map;
}
