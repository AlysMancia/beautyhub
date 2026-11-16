-- Store location: Philippine address from PSGC (psgc.cloud) + map pin.
-- Codes are PSGC codes; names are stored too so pages don't need the API to show the address.
-- Safe to run more than once.

ALTER TABLE stores ADD COLUMN IF NOT EXISTS region_code     VARCHAR(10);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS region_name     VARCHAR(120);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS province_code   VARCHAR(10);   -- empty for NCR
ALTER TABLE stores ADD COLUMN IF NOT EXISTS province_name   VARCHAR(120);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS city_code       VARCHAR(10);   -- city, municipality or Manila district
ALTER TABLE stores ADD COLUMN IF NOT EXISTS city_name       VARCHAR(160);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS barangay_code   VARCHAR(10);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS barangay_name   VARCHAR(120);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS postal_code     VARCHAR(10);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS street_address  VARCHAR(255);  -- house no., street, building
ALTER TABLE stores ADD COLUMN IF NOT EXISTS latitude        NUMERIC(9, 6);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS longitude       NUMERIC(9, 6);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_coordinates_check') THEN
        ALTER TABLE stores ADD CONSTRAINT stores_coordinates_check CHECK (
            (latitude IS NULL AND longitude IS NULL)
            OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
        );
    END IF;
END $$;
