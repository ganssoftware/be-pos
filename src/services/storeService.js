const { randomUUID } = require("crypto");
const pool = require("../config/db");
const supabase = require("../config/supabase");

function createError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function getImageExtension(file) {
    const extensions = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
    };

    if (!file || !extensions[file.mimetype]) {
        throw createError(
            "Format gambar harus JPG, PNG, atau WEBP",
            400
        );
    }

    return extensions[file.mimetype];
}

async function uploadImage(file, storeId) {
    if (!file) {
        return null;
    }

    const extension = getImageExtension(file);

    const filePath =
        `stores/store-${storeId}-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}.${extension}`;

    const { error: uploadError } =
        await supabase.storage
            .from("uploads")
            .upload(filePath, file.buffer, {
                contentType: file.mimetype,
                upsert: false,
            });

    if (uploadError) {
        throw uploadError;
    }

    const { data } = supabase.storage
        .from("uploads")
        .getPublicUrl(filePath);

    return {
        filePath,
        imageUrl: data.publicUrl,
    };
}

function getStoragePath(imageUrl) {
    if (!imageUrl) {
        return null;
    }

    try {
        const pathname = new URL(imageUrl).pathname;
        const marker =
            "/storage/v1/object/public/uploads/";

        const index = pathname.indexOf(marker);

        if (index === -1) {
            return null;
        }

        return decodeURIComponent(
            pathname.slice(index + marker.length)
        );
    } catch {
        return null;
    }
}

async function deleteStorageImage(filePath) {
    if (!filePath) {
        return;
    }

    const { error } = await supabase.storage
        .from("uploads")
        .remove([filePath]);

    if (error) {
        console.error(
            "Gagal menghapus foto toko dari Supabase:",
            error.message
        );
    }
}

async function deleteImageByUrl(imageUrl) {
    const filePath = getStoragePath(imageUrl);

    if (filePath) {
        await deleteStorageImage(filePath);
    }
}

async function findStoresByOwnerId(ownerId) {
    const result = await pool.query(
        `
        SELECT
            s.id,
            s.name,
            s.code,
            s.address,
            s.phone,
            s.image_url,
            s.is_active,
            s.owner_id,
            s.created_at,
            s.updated_at
        FROM stores s
        WHERE s.owner_id = $1
        ORDER BY s.name ASC
        `,
        [ownerId]
    );

    return result.rows;
}

async function findStoreById(storeId) {
    const result = await pool.query(
        `
        SELECT
            s.id,
            s.name,
            s.code,
            s.address,
            s.phone,
            s.image_url,
            s.is_active,
            s.owner_id,
            s.created_at,
            s.updated_at
        FROM stores s
        WHERE s.id = $1
        LIMIT 1
        `,
        [storeId]
    );

    return result.rows[0] || null;
}

async function ownerHasStore(ownerId, storeId) {
    const result = await pool.query(
        `
        SELECT 1
        FROM stores
        WHERE id = $1
          AND owner_id = $2
          AND is_active = true
        LIMIT 1
        `,
        [storeId, ownerId]
    );

    return result.rowCount > 0;
}

async function createStore(ownerId, data, file = null) {
    const { name, address, phone } = data;

    let client;
    let transactionStarted = false;
    let uploadedImage = null;

    try {
        client = await pool.connect();

        await client.query("BEGIN");
        transactionStarted = true;

        // Buat UUID dan Kode Toko secara otomatis.
        const storeId = randomUUID();

        const code =
            `TOKO-${storeId.replace(/-/g, "").slice(0, 16).toUpperCase()}`;

        // Simpan toko beserta kode otomatis.
        const storeResult = await client.query(
            `
            INSERT INTO stores (
                id,
                name,
                code,
                address,
                phone,
                owner_id,
                is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6, true)
            RETURNING
                id,
                name,
                code,
                address,
                phone,
                image_url,
                is_active,
                owner_id,
                created_at,
                updated_at
            `,
            [
                storeId,
                name,
                code,
                address || null,
                phone || null,
                ownerId,
            ]
        );

        let store = storeResult.rows[0];

        // Upload foto toko jika tersedia.
        if (file) {
            uploadedImage = await uploadImage(
                file,
                store.id
            );

            const imageResult = await client.query(
                `
                UPDATE stores
                SET
                    image_url = $1,
                    updated_at = NOW()
                WHERE id = $2
                  AND owner_id = $3
                RETURNING
                    id,
                    name,
                    code,
                    address,
                    phone,
                    image_url,
                    is_active,
                    owner_id,
                    created_at,
                    updated_at
                `,
                [
                    uploadedImage.imageUrl,
                    store.id,
                    ownerId,
                ]
            );

            store = imageResult.rows[0];
        }

        // Hubungkan Owner dengan toko.
        await client.query(
            `
            INSERT INTO store_users (
                store_id,
                user_id
            )
            VALUES ($1, $2)
            ON CONFLICT (store_id, user_id)
            DO NOTHING
            `,
            [store.id, ownerId]
        );

        await client.query("COMMIT");
        transactionStarted = false;

        return store;
    } catch (error) {
        if (client && transactionStarted) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                console.error(
                    "Rollback createStore gagal:",
                    rollbackError
                );
            }
        }

        // Hapus foto jika proses penyimpanan gagal.
        if (uploadedImage) {
            await deleteStorageImage(
                uploadedImage.filePath
            );
        }

        throw error;
    } finally {
        if (client) {
            client.release();
        }
    }
}

async function updateStore(
    ownerId,
    storeId,
    data,
    file = null
) {
    const { name, address, phone } = data;

    const access = await ownerHasStore(
        ownerId,
        storeId
    );

    if (!access) {
        throw createError(
            "Anda tidak memiliki akses ke toko ini",
            403
        );
    }

    const oldStore = await findStoreById(storeId);

    if (!oldStore) {
        throw createError(
            "Toko tidak ditemukan",
            404
        );
    }

    let uploadedImage = null;

    try {
        // Jika tidak ada file, image_url tidak diubah.
        if (file) {
            uploadedImage = await uploadImage(
                file,
                storeId
            );
        }

        const result = await pool.query(
            `
            UPDATE stores
            SET
                name = $1,
                address = $2,
                phone = $3,
                image_url = COALESCE($4, image_url),
                updated_at = NOW()
            WHERE id = $5
            AND owner_id = $6
            AND is_active = true
            RETURNING
                id,
                name,
                code,
                address,
                phone,
                image_url,
                is_active,
                owner_id,
                created_at,
                updated_at
            `,
            [
                name,
                address || null,
                phone || null,
                uploadedImage
                    ? uploadedImage.imageUrl
                    : null,
                storeId,
                ownerId,
            ]
        );

        if (!result.rows[0]) {
            throw createError(
                "Toko tidak ditemukan atau tidak dapat diperbarui",
                404
            );
        }

        const updatedStore = result.rows[0];

        // Hapus foto lama hanya setelah update berhasil.
        if (
            uploadedImage &&
            oldStore.image_url &&
            oldStore.image_url !== updatedStore.image_url
        ) {
            await deleteImageByUrl(
                oldStore.image_url
            );
        }

        return updatedStore;
    } catch (error) {
        // Jangan biarkan file baru tertinggal jika update gagal.
        if (uploadedImage) {
            await deleteStorageImage(
                uploadedImage.filePath
            );
        }

        throw error;
    }
}

async function uploadStoreImage(
    ownerId,
    storeId,
    file
) {
    if (!file) {
        throw createError(
            "Foto toko wajib dipilih",
            400
        );
    }

    const store = await findStoreById(storeId);

    if (!store) {
        throw createError(
            "Toko tidak ditemukan",
            404
        );
    }

    return updateStore(
        ownerId,
        storeId,
        {
            name: store.name,
            address: store.address,
            phone: store.phone,
        },
        file
    );
}

module.exports = {
    createStore,
    findStoresByOwnerId,
    findStoreById,
    ownerHasStore,
    updateStore,
    uploadStoreImage,
};
