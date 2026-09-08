from collections.abc import Iterable
from urllib.parse import quote

import httpx

from config import Settings


class AirtableServiceError(RuntimeError):
    pass


def _chunked(items: list[dict] | list[str], size: int) -> list[list[dict] | list[str]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def _escape_formula_value(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def build_equals_any_formula(field_name: str, values: Iterable[str]) -> str | None:
    unique_values = list(dict.fromkeys(value for value in values if value))
    if not unique_values:
        return None

    expressions = [f"{{{field_name}}}='{_escape_formula_value(value)}'" for value in unique_values]
    if len(expressions) == 1:
        return expressions[0]

    return f"OR({','.join(expressions)})"


class AirtableClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    @property
    def is_configured(self) -> bool:
        return self._settings.airtable_sync_enabled

    def _table_path(self, table_name: str, suffix: str = "") -> str:
        return f"/{quote(table_name, safe='')}{suffix}"

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict | None = None,
        json: dict | None = None,
    ) -> dict:
        if not self.is_configured:
            raise AirtableServiceError("Airtable sync is not configured.")

        async with httpx.AsyncClient(
            base_url=f"https://api.airtable.com/v0/{self._settings.airtable_base_id}",
            timeout=self._settings.airtable_request_timeout_seconds,
        ) as client:
            response = await client.request(
                method,
                path,
                params=params,
                json=json,
                headers={
                    "Authorization": f"Bearer {self._settings.airtable_access_token}",
                    "Content-Type": "application/json",
                },
            )

        if response.is_success:
            if not response.content:
                return {}
            return response.json()

        try:
            detail = response.json()
        except ValueError:
            detail = response.text

        raise AirtableServiceError(f"Airtable request failed with status {response.status_code}: {detail}")

    async def list_records(
        self,
        table_name: str,
        *,
        fields: list[str] | None = None,
        filter_formula: str | None = None,
    ) -> list[dict]:
        records: list[dict] = []
        offset: str | None = None

        while True:
            payload: dict[str, object] = {"pageSize": 100}
            if fields:
                payload["fields"] = fields
            if filter_formula:
                payload["filterByFormula"] = filter_formula
            if offset:
                payload["offset"] = offset

            response_payload = await self._request(
                "POST",
                self._table_path(table_name, "/listRecords"),
                json=payload,
            )
            records.extend(response_payload.get("records", []))
            offset = response_payload.get("offset")
            if not offset:
                break

        return records

    async def find_record_ids_by_field(
        self,
        table_name: str,
        *,
        key_field: str,
        key_values: Iterable[str],
    ) -> dict[str, str]:
        record_map: dict[str, str] = {}
        unique_values = list(dict.fromkeys(value for value in key_values if value))

        for chunk in _chunked(unique_values, 20):
            formula = build_equals_any_formula(key_field, chunk)
            if not formula:
                continue

            for record in await self.list_records(
                table_name,
                fields=[key_field],
                filter_formula=formula,
            ):
                raw_value = record.get("fields", {}).get(key_field)
                if raw_value is None:
                    continue
                record_map[str(raw_value)] = record["id"]

        return record_map

    async def create_records(self, table_name: str, rows: list[dict]) -> None:
        for chunk in _chunked(rows, 10):
            await self._request(
                "POST",
                self._table_path(table_name),
                json={
                    "records": [{"fields": row} for row in chunk],
                    "typecast": True,
                },
            )

    async def update_records(self, table_name: str, rows: list[dict]) -> None:
        for chunk in _chunked(rows, 10):
            await self._request(
                "PATCH",
                self._table_path(table_name),
                json={
                    "records": chunk,
                    "typecast": True,
                },
            )

    async def upsert_records(
        self,
        table_name: str,
        *,
        key_field: str,
        rows: list[dict],
    ) -> None:
        if not rows:
            return

        deduped_rows: dict[str, dict] = {}
        for row in rows:
            key_value = row.get(key_field)
            if key_value is None:
                raise AirtableServiceError(f"Missing '{key_field}' in Airtable payload for table '{table_name}'.")
            deduped_rows[str(key_value)] = row

        existing_records = await self.find_record_ids_by_field(
            table_name,
            key_field=key_field,
            key_values=deduped_rows.keys(),
        )

        to_create: list[dict] = []
        to_update: list[dict] = []
        for key_value, row in deduped_rows.items():
            record_id = existing_records.get(key_value)
            if record_id:
                to_update.append({"id": record_id, "fields": row})
            else:
                to_create.append(row)

        if to_create:
            await self.create_records(table_name, to_create)
        if to_update:
            await self.update_records(table_name, to_update)

    async def delete_record(self, table_name: str, record_id: str) -> None:
        await self._request(
            "DELETE",
            self._table_path(table_name, f"/{record_id}"),
        )
