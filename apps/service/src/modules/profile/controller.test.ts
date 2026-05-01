import fs from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { createControllerTestKit } from '../../../test/controller-test-kit'

const { cleanup, createAppBundle } = createControllerTestKit()

afterEach(cleanup)

describe('profile controller', () => {
  it('initializes the current account as a profile drive', async () => {
    const { bundle } = await createAppBundle('cinereel-profile-init-')

    const response = await bundle.app.inject({
      method: 'GET',
      url: '/api/profile',
    })

    expect(response.statusCode).toBe(200)
    expect((response.json() as {
      data: {
        driveKey: string
        name: string
        bio: string
        avatarPath: string | null
        collections: unknown[]
      }
    }).data).toMatchObject({
      driveKey: bundle.hyper.driveKey,
      name: '我的主页',
      bio: '',
      avatarPath: null,
      collections: [],
    })

    const descriptorBuffer = await bundle.hyper.drive.get('/.cinereel/descriptor.json')
    const profileBuffer = await bundle.hyper.drive.get('/.cinereel/profile.json')
    expect(descriptorBuffer).not.toBeNull()
    expect(JSON.parse(descriptorBuffer!.toString())).toMatchObject({
      schemaVersion: 1,
      kind: 'profile',
      name: '我的主页',
      updatedAt: expect.any(Number),
    })
    expect(JSON.parse(profileBuffer!.toString())).toMatchObject({
      name: '我的主页',
      bio: '',
      avatarPath: null,
    })

    const profileDocumentResponse = await bundle.app.inject({
      method: 'GET',
      url: '/api/profile/document',
    })
    const profileCollectionsResponse = await bundle.app.inject({
      method: 'GET',
      url: '/api/profile/collections',
    })

    expect(profileDocumentResponse.statusCode).toBe(200)
    expect((profileDocumentResponse.json() as {
      data: {
        name: string
        bio: string
        avatarPath: string | null
      }
    }).data).toMatchObject({
      name: '我的主页',
      bio: '',
      avatarPath: null,
    })
    expect(profileCollectionsResponse.statusCode).toBe(200)
    expect((profileCollectionsResponse.json() as {
      data: {
        items: unknown[]
      }
    }).data.items).toEqual([])
  }, 20_000)

  it('updates profile name, bio and avatar inside the profile drive', async () => {
    const { bundle } = await createAppBundle('cinereel-profile-update-')

    const avatarDataUrl = `data:image/png;base64,${Buffer.from('png-avatar').toString('base64')}`
    const response = await bundle.app.inject({
      method: 'PATCH',
      url: '/api/profile',
      payload: {
        name: 'Lynn',
        bio: 'Profile drive account',
        avatarDataUrl,
      },
    })

    expect(response.statusCode).toBe(200)
    const payload = (response.json() as {
      data: {
        driveKey: string
        name: string
        bio: string
        avatarPath: string | null
        avatarUrl: string | null
        updatedAt: number
      }
    }).data

    expect(payload).toMatchObject({
      driveKey: bundle.hyper.driveKey,
      name: 'Lynn',
      bio: 'Profile drive account',
      avatarPath: '/avatar.png',
    })
    expect(payload.avatarUrl).toBe(`/api/stream/avatar.png?t=${payload.updatedAt}`)

    const descriptorBuffer = await bundle.hyper.drive.get('/.cinereel/descriptor.json')
    const profileBuffer = await bundle.hyper.drive.get('/.cinereel/profile.json')
    const avatarBuffer = await bundle.hyper.drive.get('/avatar.png')
    const avatarResponse = await bundle.app.inject({
      method: 'GET',
      url: `/api/stream/avatar.png?t=${payload.updatedAt}`,
    })

    expect(JSON.parse(descriptorBuffer!.toString())).toMatchObject({
      schemaVersion: 1,
      kind: 'profile',
      name: 'Lynn',
      updatedAt: expect.any(Number),
    })
    expect(JSON.parse(profileBuffer!.toString())).toMatchObject({
      name: 'Lynn',
      bio: 'Profile drive account',
      avatarPath: '/avatar.png',
    })
    expect(avatarBuffer?.toString()).toBe('png-avatar')
    expect(avatarResponse.statusCode).toBe(200)
    expect(avatarResponse.headers['content-type']).toContain('image/png')

    const profileDocumentResponse = await bundle.app.inject({
      method: 'GET',
      url: '/api/profile/document',
    })

    expect(profileDocumentResponse.statusCode).toBe(200)
    expect((profileDocumentResponse.json() as {
      data: {
        name: string
        bio: string
        avatarPath: string | null
      }
    }).data).toMatchObject({
      name: 'Lynn',
      bio: 'Profile drive account',
      avatarPath: '/avatar.png',
    })
  }, 20_000)

  it('returns collections.json through the profile collections api', async () => {
    const { bundle } = await createAppBundle('cinereel-profile-collections-')

    const createResponse = await bundle.app.inject({
      method: 'POST',
      url: '/api/drives',
      payload: {
        name: '合集 A',
      },
    })

    expect(createResponse.statusCode).toBe(200)
    const driveKey = (createResponse.json() as {
      data: {
        driveKey: string
      }
    }).data.driveKey

    const collectionsResponse = await bundle.app.inject({
      method: 'GET',
      url: '/api/profile/collections',
    })

    expect(collectionsResponse.statusCode).toBe(200)
    expect((collectionsResponse.json() as {
      data: {
        items: Array<{
          driveKey: string
          name: string
          addedAt: number
          updatedAt: number
        }>
      }
    }).data.items[0]).toMatchObject({
      driveKey,
      name: '合集 A',
      addedAt: expect.any(Number),
      updatedAt: expect.any(Number),
    })
  }, 20_000)
})
