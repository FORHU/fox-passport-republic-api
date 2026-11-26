-- Events and packages held at a Place (epic #517, #520). Two nullable columns;
-- existing rows keep their venues. A Place in use can't be deleted.
-- Down: drop the two constraints, indexes and columns.
ALTER TABLE "event_templates" ADD COLUMN "placeId" TEXT;
ALTER TABLE "events" ADD COLUMN "placeId" TEXT;

CREATE INDEX "event_templates_placeId_idx" ON "event_templates"("placeId");
CREATE INDEX "events_placeId_idx" ON "events"("placeId");

ALTER TABLE "event_templates" ADD CONSTRAINT "event_templates_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
