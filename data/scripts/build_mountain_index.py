"""100대명산 GeoJSON -> 앱 목록용 경량 인덱스(JSON).

산별로 코스 수, 총/최장 거리, 고도 범위, 대표 좌표(코스 시작점들의 평균)를 집계한다.
지도 렌더링 없이 목록·검색 화면에서 바로 쓸 수 있는 크기를 목표로 한다.
"""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1]
SRC = DATA / "processed" / "myeongsan100.geojson"
OUT = DATA / "processed" / "myeongsan100_index.json"


def summarize(features):
    groups = {}
    for feat in features:
        p = feat["properties"]
        name = p["그룹"]
        coords = feat["geometry"]["coordinates"]
        g = groups.setdefault(name, {"산이름": name, "코스수": 0, "총거리_km": 0.0,
                                     "최장코스_km": 0.0, "최고고도_m": None,
                                     "_lon": 0.0, "_lat": 0.0})
        g["코스수"] += 1
        g["총거리_km"] += p["거리_km"]
        g["최장코스_km"] = max(g["최장코스_km"], p["거리_km"])
        if p["최고고도_m"] is not None:
            g["최고고도_m"] = max(g["최고고도_m"] or 0, p["최고고도_m"])
        g["_lon"] += coords[0][0]
        g["_lat"] += coords[0][1]

    out = []
    for g in groups.values():
        n = g["코스수"]
        out.append({
            "산이름": g["산이름"],
            "코스수": n,
            "총거리_km": round(g["총거리_km"], 1),
            "최장코스_km": round(g["최장코스_km"], 1),
            "최고고도_m": g["최고고도_m"],
            "대표좌표": [round(g["_lon"] / n, 6), round(g["_lat"] / n, 6)],
        })
    return sorted(out, key=lambda x: x["산이름"])


def main():
    data = json.loads(SRC.read_text(encoding="utf-8"))
    index = summarize(data["features"])
    OUT.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"mountains={len(index)} out={OUT} size={OUT.stat().st_size:,}")


if __name__ == "__main__":
    main()
