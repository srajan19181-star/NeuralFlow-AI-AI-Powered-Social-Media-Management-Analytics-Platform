import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import { useI18n } from '../locales'
import { useComposeStore, type Destination } from '../stores/compose'
import { usePlatformsStore } from '../stores/platforms'
import { useAiStore, type ImageProvider, type ImageProviderName } from '../stores/ai'
import { useHashtagStore } from '../stores/hashtags'
import { useCompetitorStore } from '../stores/competitors'
import PostPreview from '../components/compose/PostPreview'
import ImageFormatEditor from '../components/compose/ImageFormatEditor'
import ReelBuilder from '../components/compose/ReelBuilder'
import { COMMON_TIMEZONES, getBrowserTimezone, getTimezoneAbbr, utcToNaiveDatetimeString } from '../utils/timezone'

type ImageAspect = '1:1' | '16:9' | '9:16' | '3:4'

const IMAGE_SIZES: { value: ImageAspect; label: string }[] = [
  { value: '3:4', label: '3:4' },
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
]

interface Suggestion { utc: string; dayOfWeek: number; hour: number; label: string }

const STOP_WORDS = new Set([
  'the','and','for','are','but','not','you','all','can','her','was','one','our',
  'out','about','have','from','they','this','that','with','will','been','were',
  'when','what','your','more','also','than','then','into','its','just','like',
  'some','their','there','these','those','which','would','could','should','after',
  'very','well','here','where','does','each','both','such','even','most','said',
  'over','only','same','much','before','through','while','under','first','last',
])

function extractKeywordHashtags(text: string): string[] {
  return [
    ...new Set(
      text
        .replace(/[^a-zA-Z\s]/g, ' ')
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !STOP_WORDS.has(w))
    ),
  ]
    .slice(0, 8)
    .map((w) => `#${w}`)
}

function parseHashtagsFromResponse(text: string): string[] {
  const tags = (text.match(/#[a-zA-Z]\w*/g) || [])
    .map((t) => t.toLowerCase())
  return [...new Set(tags)].slice(0, 10)
}

function isImage(url: string) {
  return /\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(url)
}

export default function Compose() {
  const { t } = useI18n()
  const composeStore = useComposeStore()
  const platformsStore = usePlatformsStore()
  const aiStore = useAiStore()
  const hashtagStore = useHashtagStore()
  const competitorStore = useCompetitorStore()
  const navigate = useNavigate()
  const location = useLocation()

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const urlInputRef = useRef<HTMLInputElement | null>(null)
  const [pasteUrlValue, setPasteUrlValue] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [mediaLoadError, setMediaLoadError] = useState(false)
  const [activePreviewKey, setActivePreviewKey] = useState('')
  const [draftSavedBanner, setDraftSavedBanner] = useState(false)
  const [firstCommentOpen, setFirstCommentOpen] = useState(false)

  const [scheduleTimezone, setScheduleTimezone] = useState(getBrowserTimezone())
  const timezoneAbbr = useMemo(() => getTimezoneAbbr(scheduleTimezone), [scheduleTimezone])

  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [suggestionsSource, setSuggestionsSource] = useState<'history' | 'default' | ''>('')
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)

  // AI Generation State
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [aiTopic, setAiTopic] = useState('')
  const [aiGoal, setAiGoal] = useState('')
  const [aiToneOverride, setAiToneOverride] = useState('')
  const [generating, setGenerating] = useState(false)
  const [aiError, setAiError] = useState(false)
  const [aiContextAccount, setAiContextAccount] = useState('')
  const abortControllerRef = useRef<AbortController | null>(null)
  const [useCompetitorContext, setUseCompetitorContext] = useState(false)
  const [useResearchBrief, setUseResearchBrief] = useState(false)
  const [researchLoading, setResearchLoading] = useState(false)
  const [researchBrief, setResearchBrief] = useState<{ painPoints: string[]; trendingTopics: string[]; communityLanguage: string[]; contentAngles: string[] } | null>(null)
  const [researchBriefAt, setResearchBriefAt] = useState<Date | null>(null)
  const [researchBriefOpen, setResearchBriefOpen] = useState(false)

  // Vision caption
  const [captionGenerating, setCaptionGenerating] = useState(false)
  const [captionError, setCaptionError] = useState(false)

  // Image Gen State
  const [imageGenAvailable, setImageGenAvailable] = useState(false)
  const [imageProviders, setImageProviders] = useState<ImageProvider[]>([])
  const [imageProvider, setImageProvider] = useState<ImageProviderName>('openai')
  const [imagePanelOpen, setImagePanelOpen] = useState(false)
  const [imagePrompt, setImagePrompt] = useState('')
  const [imageSize, setImageSize] = useState<ImageAspect>('3:4')
  const [imageFit, setImageFit] = useState<'contain' | 'cover'>('contain')
  const [generatedImage, setGeneratedImage] = useState<{ mediaUrl: string; width: number; height: number; aspect: string } | null>(null)
  const [imageQuality, setImageQuality] = useState<'standard' | 'hd'>('standard')
  const [imageStyle, setImageStyle] = useState<'vivid' | 'natural'>('vivid')
  const [useImageVariation, setUseImageVariation] = useState(false)
  const [imageGenerating, setImageGenerating] = useState(false)
  const [imageError, setImageError] = useState('')

  // Instagram
  const [instagramCapabilities, setInstagramCapabilities] = useState<Record<string, { story: boolean; publishingPermission?: boolean | null; error?: string }>>({})
  const [checkingInstagram, setCheckingInstagram] = useState(false)
  const [coverImages, setCoverImages] = useState<{ url: string; originalName: string }[]>([])
  const [dimensions, setDimensions] = useState<{ width: number; height: number; duration?: number } | null>(null)

  // Hashtags
  const [suggestedHashtags, setSuggestedHashtags] = useState<string[]>([])
  const [hashtagsLoading, setHashtagsLoading] = useState(false)

  const profileCacheRef = useRef<Record<string, Record<string, string>>>({})

  const activeImageProvider = useMemo(() =>
    imageProviders.find((p) => p.name === imageProvider),
    [imageProviders, imageProvider]
  )

  const instagramDestinations = useMemo(() =>
    composeStore.selectedDestinations.filter((d) => d.platform === 'instagram'),
    [composeStore.selectedDestinations]
  )

  const placementFor = useCallback((dest: Destination) => {
    return dest.instagramPlacement || (/\.(mp4|mov|avi|webm)(?:[?#]|$)/i.test(composeStore.mediaUrl) ? 'reel' : 'feed')
  }, [composeStore.mediaUrl])

  const instagramImageAspect = useMemo<ImageAspect>(() => {
    const dest = instagramDestinations.find((d) => d.key === activePreviewKey) || instagramDestinations[0]
    return dest && placementFor(dest) !== 'feed' ? '9:16' : '3:4'
  }, [activePreviewKey, instagramDestinations, placementFor])

  useEffect(() => {
    if (instagramDestinations.length) {
      setImageSize(instagramImageAspect)
    }
  }, [instagramDestinations.length, instagramImageAspect])

  useEffect(() => {
    setDimensions(null)
  }, [composeStore.mediaUrl])

  const refreshInstagramCapabilities = useCallback(async () => {
    setCheckingInstagram(true)
    try {
      const result = await axios.get('/api/instagram/capabilities')
      setInstagramCapabilities(Object.fromEntries(result.data.accounts.map((account: { id: string }) => [account.id, account])))
    } catch {
      setInstagramCapabilities({})
    } finally {
      setCheckingInstagram(false)
    }
  }, [])

  const loadAiContext = useCallback(async () => {
    const firstDest = composeStore.selectedDestinations[0]
    if (!firstDest) {
      setAiContextAccount('')
      return
    }

    setAiContextAccount(firstDest.label)

    if (!profileCacheRef.current[firstDest.key]) {
      try {
        const res = await axios.get(`/api/profiles/${encodeURIComponent(firstDest.key)}`)
        profileCacheRef.current[firstDest.key] = res.data
      } catch {
        profileCacheRef.current[firstDest.key] = {}
      }
    }
  }, [composeStore.selectedDestinations])

  const toggleAiPanel = () => {
    setAiPanelOpen((prev) => {
      const next = !prev
      if (next) loadAiContext()
      return next
    })
  }

  // Delivery timer polling
  useEffect(() => {
    const deliveryTimer = setInterval(() => {
      if (composeStore.lastResult?.processing) {
        void composeStore.refreshPostStatus()
      }
    }, 5000)
    return () => clearInterval(deliveryTimer)
  }, [composeStore])

  // Mount effect
  useEffect(() => {
    void composeStore.refreshPostStatus()
    Promise.all([
      platformsStore.fetchStatuses(),
      platformsStore.fetchMetaConnections(),
      aiStore.fetchConfig(),
      hashtagStore.fetchGroups(),
      competitorStore.fetchCompetitors(),
    ]).then(() => {
      composeStore.initDestinations()
      const igPlacement = searchParams.get('instagramPlacement')
      if (igPlacement && ['feed', 'story', 'reel'].includes(igPlacement)) {
        for (const dest of composeStore.destinations) {
          if (dest.platform === 'instagram') {
            dest.instagramPlacement = igPlacement as 'feed' | 'story' | 'reel'
          }
        }
      }
      void refreshInstagramCapabilities()
      void axios.get('/api/media-library')
        .then((res) => {
          setCoverImages((res.data.files || []).filter((f: { mimetype: string }) => f.mimetype.startsWith('image/')))
        })
        .catch(() => {})
    })

    aiStore.fetchImageProviders().then((providers) => {
      setImageProviders(providers)
      setImageGenAvailable(providers.length > 0)
      const remembered = localStorage.getItem('compose.imageProvider') as ImageProviderName | null
      setImageProvider(providers.some((p) => p.name === remembered) ? (remembered as ImageProviderName) : (providers[0]?.name ?? 'openai'))
    }).catch(() => {
      setImageGenAvailable(false)
    })

    const prefill = searchParams.get('prefill')
    if (prefill) composeStore.content = String(prefill)

    const mediaParam = searchParams.get('media')
    if (mediaParam) {
      composeStore.mediaUrl = String(mediaParam)
      setMediaLoadError(false)
    }

    const draftId = searchParams.get('draft')
    if (draftId) {
      axios.get(`/api/drafts/${draftId}`).then((res) => {
        composeStore.loadDraft(res.data)
        setMediaLoadError(false)
      }).catch((err) => {
        console.error('Failed to load draft:', err)
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep activePreviewKey pointed at a selected destination
  useEffect(() => {
    const selected = composeStore.selectedDestinations
    if (!selected.find((d) => d.key === activePreviewKey)) {
      setActivePreviewKey(selected[0]?.key ?? '')
    }
  }, [composeStore.selectedDestinations, activePreviewKey])

  // Watch selected destination for schedule suggestions and timezone
  const firstDestKey = composeStore.selectedDestinations[0]?.key
  useEffect(() => {
    if (!firstDestKey) {
      setSuggestions([])
      return
    }
    const timer = setTimeout(async () => {
      const first = composeStore.selectedDestinations[0]
      if (!first) return
      setSuggestionsLoading(true)
      try {
        const params: Record<string, string> = { platform: first.platform }
        if (first.accountId) params.accountId = first.accountId
        const res = await axios.get('/api/schedule/suggestions', { params })
        setSuggestions(res.data.suggestions ?? [])
        setSuggestionsSource(res.data.source ?? '')
      } catch {
        setSuggestions([])
      } finally {
        setSuggestionsLoading(false)
      }
    }, 300)

    // Load profile timezone
    ;(async () => {
      try {
        const cached = profileCacheRef.current[firstDestKey]
        const profile = cached ?? (await axios.get(`/api/profiles/${encodeURIComponent(firstDestKey)}`)).data
        if (!cached) profileCacheRef.current[firstDestKey] = profile
        if (profile?.timezone) setScheduleTimezone(profile.timezone)
      } catch {
        // ignore
      }
    })()

    return () => clearTimeout(timer)
  }, [firstDestKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key: string) => {
    composeStore.toggleDestination(key)
    const dest = composeStore.destinations.find((d) => d.key === key)
    if (dest?.selected) setActivePreviewKey(key)
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadError('')
    setMediaLoadError(false)

    try {
      const form = new FormData()
      form.append('file', file)
      const res = await axios.post('/api/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      composeStore.mediaUrl = res.data.url
    } catch (err: any) {
      setUploadError(err.response?.data?.error ?? t('compose.uploadFailed'))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const toggleUrlInput = () => {
    setShowUrlInput((prev) => {
      const next = !prev
      if (next) {
        setTimeout(() => urlInputRef.current?.focus(), 50)
      }
      return next
    })
    setUploadError('')
  }

  const applyPastedUrl = () => {
    const url = pasteUrlValue.trim()
    if (url) {
      composeStore.mediaUrl = url
      setPasteUrlValue('')
      setShowUrlInput(false)
      setMediaLoadError(false)
    }
  }

  const removeMedia = () => {
    composeStore.mediaUrl = ''
    setMediaLoadError(false)
    setUploadError('')
    setShowUrlInput(false)
  }

  const applySuggestion = (s: Suggestion) => {
    composeStore.scheduledAt = utcToNaiveDatetimeString(s.utc, scheduleTimezone)
  }

  const formatSuggestionChip = (s: Suggestion): string => {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
      timeZone: scheduleTimezone,
      hour12: true,
    }).format(new Date(s.utc))
  }

  const mediaFilename = useMemo(() => {
    try {
      return decodeURIComponent(composeStore.mediaUrl.split('/').pop() ?? '')
    } catch {
      return composeStore.mediaUrl
    }
  }, [composeStore.mediaUrl])

  const igSelectedWithoutMedia = useMemo(() =>
    composeStore.selectedDestinations.some((d) => d.platform === 'instagram') && !composeStore.mediaUrl.trim(),
    [composeStore.selectedDestinations, composeStore.mediaUrl]
  )

  const overLimit = useMemo(() =>
    Boolean(composeStore.activeCharLimit && composeStore.content.length > composeStore.activeCharLimit),
    [composeStore.activeCharLimit, composeStore.content.length]
  )

  const charNearLimit = useMemo(() =>
    Boolean(composeStore.activeCharLimit && composeStore.content.length > composeStore.activeCharLimit * 0.9),
    [composeStore.activeCharLimit, composeStore.content.length]
  )

  const instagramIssue = useMemo(() => {
    for (const dest of instagramDestinations) {
      const placement = placementFor(dest)
      const capability = instagramCapabilities[dest.accountId || '']
      if (capability?.publishingPermission === false) return t('instagramPublishing.permissionRequired')
      if (placement === 'story' && !capability?.story) return t('instagramPublishing.businessRequired')
      if (!composeStore.mediaUrl) continue
      const video = !isImage(composeStore.mediaUrl)
      if (placement === 'reel' && !video) return t('instagramPublishing.videoRequired')
      if (placement === 'feed' && video) return t('instagramPublishing.chooseReel')
      if (!dimensions) continue
      const { width, height, duration } = dimensions
      const validRatio = placement === 'feed' ? width * 4 === height * 3 || width * 5 === height * 4 : width * 16 === height * 9
      if (!validRatio) return t('instagramPublishing.ratioRequired', { ratio: placement === 'feed' ? '3:4' : '9:16' })
      if (video && duration !== undefined && (duration < 3 || duration > (placement === 'story' ? 60 : 900))) {
        return t('instagramPublishing.durationRequired', { seconds: placement === 'story' ? 60 : 900 })
      }
    }
    return ''
  }, [dimensions, instagramCapabilities, instagramDestinations, placementFor, composeStore.mediaUrl, t])

  const canPost = useMemo(() =>
    !composeStore.lastResult?.processing &&
    (Boolean(composeStore.content.trim()) || (instagramDestinations.length > 0 && composeStore.selectedDestinations.every((d) => d.platform === 'instagram' && placementFor(d) === 'story'))) &&
    composeStore.selectedDestinations.length > 0 &&
    !overLimit &&
    !igSelectedWithoutMedia &&
    !instagramIssue,
    [composeStore.lastResult?.processing, composeStore.content, instagramDestinations.length, composeStore.selectedDestinations, placementFor, overLimit, igSelectedWithoutMedia, instagramIssue]
  )

  const postButtonLabel = composeStore.scheduledAt ? `⏰ ${t('compose.schedule')}` : t('compose.send')

  const hasCompetitorSummaries = useMemo(() =>
    Array.isArray(competitorStore.competitors) && competitorStore.competitors.some((c) => c.aiSummary?.trim()),
    [competitorStore.competitors]
  )

  const competitorNames = useMemo(() =>
    Array.isArray(competitorStore.competitors)
      ? competitorStore.competitors.filter((c) => c.aiSummary?.trim()).map((c) => c.name).join(', ')
      : '',
    [competitorStore.competitors]
  )

  const aiConfigured = Boolean(aiStore.config?.enabled && aiStore.config?.endpoint)

  const inspectImage = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget
    setDimensions({ width: image.naturalWidth, height: image.naturalHeight })
  }

  const inspectVideo = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget
    setDimensions({ width: video.videoWidth, height: video.videoHeight, duration: video.duration })
  }

  const changePlacement = (dest: Destination, value: string) => {
    dest.instagramPlacement = value as 'feed' | 'story' | 'reel'
    if (value !== 'reel') {
      dest.shareToFeed = undefined
      dest.coverUrl = undefined
    }
  }

  const applyRenderedReel = (url: string) => {
    composeStore.mediaUrl = url
    setMediaLoadError(false)
    for (const destination of instagramDestinations) {
      destination.instagramPlacement = 'reel'
      destination.shareToFeed ??= false
    }
  }

  const buildSystemPrompt = (profile: Record<string, string>): string => {
    const platforms = composeStore.selectedDestinations.map((d) => d.platform).join(', ')
    const charLimit = composeStore.activeCharLimit ? `${composeStore.activeCharLimit} characters` : 'no strict limit'
    const tone = aiToneOverride || profile.toneOfVoice || 'professional'

    const lines = [
      'You are a social media content writer. Write engaging, on-brand post content.',
      '',
      'BRAND CONTEXT:',
    ]
    if (profile.businessName) lines.push(`Business: ${profile.businessName}`)
    if (profile.description) lines.push(`Description: ${profile.description}`)
    if (profile.industry) lines.push(`Industry: ${profile.industry}`)
    if (profile.targetAudience) lines.push(`Target audience: ${profile.targetAudience}`)
    if (profile.keywords) lines.push(`Keywords: ${profile.keywords}`)
    if (profile.hashtags) lines.push(`Preferred hashtags: ${profile.hashtags}`)
    if (profile.postingGuidelines) lines.push(`Guidelines: ${profile.postingGuidelines}`)

    lines.push('', 'PLATFORM RULES:')
    lines.push(`Platform(s): ${platforms || 'general'}`)
    lines.push(`Character limit: ${charLimit}`)
    lines.push(`Tone of voice: ${tone}`)
    if (aiGoal) lines.push(`Goal: ${aiGoal}`)

    lines.push('', 'OUTPUT RULES:')
    lines.push('- Write ONLY the post content, nothing else.')
    lines.push('- No preamble, no explanation, no quotation marks around the post.')
    lines.push('- Include relevant hashtags if appropriate.')
    lines.push('- Stay within the character limit.')

    return lines.join('\n')
  }

  const researchAudience = async () => {
    const firstDest = composeStore.selectedDestinations[0]
    setResearchLoading(true)
    try {
      const res = await axios.post('/api/ai/research', { accountKey: firstDest?.key })
      setResearchBrief(res.data.brief)
      setResearchBriefAt(new Date(res.data.updatedAt))
      setResearchBriefOpen(true)
      setUseResearchBrief(true)
    } catch (err: any) {
      console.error('Research failed:', err)
    } finally {
      setResearchLoading(false)
    }
  }

  const researchBriefAgeLabel = (): string => {
    if (!researchBriefAt) return ''
    const mins = Math.round((Date.now() - researchBriefAt.getTime()) / 60000)
    if (mins < 1) return t('compose.researchJustNow')
    if (mins < 60) return t('compose.researchMinutesAgo', { n: mins })
    const hrs = Math.round(mins / 60)
    return t('compose.researchHoursAgo', { n: hrs })
  }

  const generatePost = async () => {
    setAiError(false)
    const firstDest = composeStore.selectedDestinations[0]
    const profile = firstDest ? (profileCacheRef.current[firstDest.key] || {}) : {}
    const system = buildSystemPrompt(profile)
    const prompt = aiTopic.trim()

    abortControllerRef.current = new AbortController()
    setGenerating(true)
    composeStore.content = ''

    try {
      const gen = aiStore.streamGenerate(
        prompt, system, undefined, abortControllerRef.current.signal,
        useCompetitorContext, composeStore.selectedDestinations,
        useResearchBrief, firstDest?.key,
      )
      for await (const token of gen) {
        composeStore.content += token
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setAiError(true)
        console.error('AI generation error:', err)
      }
    } finally {
      setGenerating(false)
      abortControllerRef.current = null
    }
  }

  const stopGeneration = () => {
    abortControllerRef.current?.abort()
  }

  const generateCaption = async () => {
    setCaptionError(false)
    setCaptionGenerating(true)
    try {
      const caption = await aiStore.generateCaption(composeStore.mediaUrl)
      const sep = composeStore.content.trim() ? '\n\n' : ''
      composeStore.content = composeStore.content.trim() + sep + caption
    } catch {
      setCaptionError(true)
    } finally {
      setCaptionGenerating(false)
    }
  }

  const toggleImagePanel = () => {
    setImagePanelOpen((prev) => {
      const next = !prev
      if (next && !imagePrompt) {
        setImagePrompt(composeStore.content.slice(0, 500))
      }
      return next
    })
  }

  const generateImage = async () => {
    setImageGenerating(true)
    setImageError('')
    try {
      const result = await aiStore.generateImage({
        prompt: imagePrompt,
        provider: imageProvider,
        size: imageSize,
        fit: imageFit,
        quality: imageQuality,
        style: imageStyle,
        referenceImageUrl: useImageVariation && composeStore.mediaUrl ? composeStore.mediaUrl : undefined,
      })
      setGeneratedImage(result)
    } catch (err: any) {
      setImageError(err.response?.data?.detail || err.response?.data?.error || t('compose.imageGenerateFailed'))
    } finally {
      setImageGenerating(false)
    }
  }

  const suggestHashtags = async () => {
    const content = composeStore.content.trim()
    if (!content || content.length < 30) {
      setSuggestedHashtags([])
      return
    }

    setHashtagsLoading(true)
    try {
      if (aiConfigured) {
        const firstDest = composeStore.selectedDestinations[0]
        const profile = firstDest ? (profileCacheRef.current[firstDest.key] || {}) : {}
        const platforms = composeStore.selectedDestinations.map((d: { platform: string }) => d.platform).join(', ')

        const system = 'You are a social media hashtag expert. Return ONLY hashtags, no explanation or extra text.'
        const prompt = [
          `Suggest 8 relevant hashtags for the following social media post.`,
          platforms ? `Platform: ${platforms}` : '',
          profile.industry ? `Industry: ${profile.industry}` : '',
          profile.keywords ? `Keywords: ${profile.keywords}` : '',
          ``,
          `Post content:`,
          content,
          ``,
          `Return exactly 8 hashtags as a space-separated list. Example: #marketing #growth #tips`,
        ].filter(Boolean).join('\n')

        const text = await aiStore.generate(prompt, system)
        const parsed = parseHashtagsFromResponse(text)
        setSuggestedHashtags(parsed.length ? parsed : extractKeywordHashtags(content))
      } else {
        setSuggestedHashtags(extractKeywordHashtags(content))
      }
    } catch {
      setSuggestedHashtags(extractKeywordHashtags(content))
    } finally {
      setHashtagsLoading(false)
    }
  }

  const contentHasTag = (tag: string): boolean => {
    return composeStore.content.toLowerCase().includes(tag.toLowerCase())
  }

  const insertHashtag = (tag: string) => {
    if (contentHasTag(tag)) return
    const sep = composeStore.content.endsWith(' ') || !composeStore.content ? '' : ' '
    composeStore.content += `${sep}${tag}`
  }

  const insertHashtagGroup = (hashtags: string[]) => {
    const toInsert = hashtags.filter((t) => !contentHasTag(t))
    if (!toInsert.length) return
    const sep = composeStore.content.endsWith(' ') || !composeStore.content ? '' : ' '
    composeStore.content += `${sep}${toInsert.join(' ')}`
  }

  // Debounce hashtag suggestion
  const hashtagTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (generating) return
    if (hashtagTimerRef.current) clearTimeout(hashtagTimerRef.current)
    if (composeStore.content.trim().length < 30) {
      setSuggestedHashtags([])
      return
    }
    hashtagTimerRef.current = setTimeout(() => suggestHashtags(), 1500)
    return () => {
      if (hashtagTimerRef.current) clearTimeout(hashtagTimerRef.current)
    }
  }, [composeStore.content, generating]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveDraft = async () => {
    const ok = await composeStore.saveDraft()
    if (ok) {
      setDraftSavedBanner(true)
      setTimeout(() => setDraftSavedBanner(false), 2500)
    }
  }

  const handlePost = async () => {
    const ok = await composeStore.post(scheduleTimezone)
    if (ok) setTimeout(() => navigate('/dashboard'), 1500)
  }

  return (
    <div className="flex flex-col lg:flex-row lg:h-screen lg:overflow-hidden bg-gray-950 text-gray-100">
      {/* ── Left panel: editor ── */}
      <div className="flex-1 flex flex-col min-w-0 lg:overflow-y-auto p-4 sm:p-6">
        <div className="max-w-2xl w-full mx-auto flex flex-col gap-4">

          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">{t('compose.title')}</h1>
            <Link to="/dashboard" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
              {t('compose.cancel')}
            </Link>
          </div>

          {/* Account selector */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">{t('compose.destinationsLabel')}</p>

            {composeStore.destinations.length ? (
              <div className="flex flex-wrap gap-3">
                {composeStore.destinations.map((dest) => (
                  <button
                    key={dest.key}
                    onClick={() => toggle(dest.key)}
                    title={dest.label}
                    className={`relative focus:outline-none transition-all duration-150 ${
                      dest.selected ? 'opacity-100' : 'opacity-40 hover:opacity-70 grayscale hover:grayscale-0'
                    }`}
                  >
                    <div
                      className={`w-12 h-12 rounded-full overflow-hidden flex items-center justify-center text-white font-bold text-base ring-2 ring-offset-2 ring-offset-gray-950 transition-all ${
                        dest.selected ? 'ring-white' : 'ring-transparent'
                      }`}
                      style={dest.selected ? ({ '--tw-ring-color': dest.color } as React.CSSProperties) : {}}
                    >
                      {dest.picture ? (
                        <img src={dest.picture} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center font-bold text-sm" style={{ backgroundColor: dest.color }}>
                          {dest.label[0]}
                        </span>
                      )}
                    </div>

                    {dest.accountId && (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-white font-bold border-2 border-gray-900"
                        style={{ fontSize: '8px', backgroundColor: dest.color }}
                      >
                        {dest.platform === 'facebook' ? 'f' : 'I'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-600">
                {t('compose.noDestinations')}
                <Link to="/settings" className="text-blue-400 hover:text-blue-300 ml-1">{t('compose.goToSettings')}</Link>
              </p>
            )}
          </div>

          {/* Instagram Settings */}
          {Boolean(instagramDestinations.length) && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <div className="flex justify-between gap-2 text-xs">
                <span>{t('instagramPublishing.title')}</span>
                <button disabled={checkingInstagram} onClick={refreshInstagramCapabilities} className="text-blue-400 disabled:opacity-50">
                  {t('instagramPublishing.check')}
                </button>
              </div>
              {instagramDestinations.map((dest) => (
                <div key={dest.key} className="space-y-2 text-xs">
                  <label className="flex items-center justify-between gap-3">
                    <span>{dest.label}</span>
                    <select
                      value={placementFor(dest)}
                      onChange={(e) => changePlacement(dest, e.target.value)}
                      className="bg-gray-800 rounded p-2"
                    >
                      <option value="feed">{t('instagramPublishing.feed')} · 3:4</option>
                      <option value="story" disabled={!instagramCapabilities[dest.accountId || '']?.story}>
                        {t('instagramPublishing.story')} · 9:16
                      </option>
                      <option value="reel">{t('instagramPublishing.reel')} · 9:16</option>
                    </select>
                  </label>
                  {!instagramCapabilities[dest.accountId || '']?.story && (
                    <p className="text-gray-400">{t('instagramPublishing.businessRequired')}</p>
                  )}
                  {placementFor(dest) === 'reel' && (
                    <>
                      <label className="flex gap-2">
                        <input
                          type="checkbox"
                          checked={dest.shareToFeed || false}
                          onChange={(e) => { dest.shareToFeed = e.target.checked }}
                        />
                        {t('instagramPublishing.shareToFeed')}
                      </label>
                      <label className="block">{t('instagramPublishing.cover')}
                        <select
                          value={dest.coverUrl || ''}
                          onChange={(e) => { dest.coverUrl = e.target.value }}
                          className="block mt-1 bg-gray-800 rounded p-2 w-full"
                        >
                          <option value="">{t('instagramPublishing.videoFrame')}</option>
                          {coverImages.map((image) => (
                            <option key={image.url} value={image.url}>{image.originalName}</option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  {placementFor(dest) === 'story' && (
                    <p className="text-gray-400">{t('instagramPublishing.storyText')}</p>
                  )}
                </div>
              ))}
              {instagramIssue && <p className="text-amber-400 text-xs" role="status">{instagramIssue}</p>}
            </div>
          )}

          <ReelBuilder onApply={applyRenderedReel} />

          {/* Textarea */}
          <div className={`bg-gray-900 border border-gray-800 rounded-xl overflow-hidden ${overLimit ? 'border-red-700' : ''}`}>
            <textarea
              value={composeStore.content}
              onChange={(e) => { composeStore.content = e.target.value }}
              placeholder={t('compose.placeholder')}
              rows={7}
              className="w-full bg-transparent text-gray-100 placeholder-gray-600 resize-none focus:outline-none text-sm leading-relaxed p-4"
            />

            {/* Media: attached file preview */}
            {Boolean(composeStore.mediaUrl.trim()) && (
              <div className="px-4 pb-3">
                <div className="relative inline-block group">
                  {isImage(composeStore.mediaUrl) ? (
                    <img
                      src={composeStore.mediaUrl}
                      alt=""
                      className="rounded-lg max-h-48 max-w-full object-cover border border-gray-700"
                      onError={() => setMediaLoadError(true)}
                      onLoad={inspectImage}
                    />
                  ) : (
                    <>
                      <video
                        src={composeStore.mediaUrl}
                        controls
                        preload="metadata"
                        className="max-h-64 max-w-full rounded-lg"
                        onLoadedMetadata={inspectVideo}
                      />
                      <div className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5">
                        <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span className="text-xs text-gray-300 truncate max-w-xs">{mediaFilename}</span>
                      </div>
                    </>
                  )}
                  <button
                    onClick={removeMedia}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-gray-700 hover:bg-red-600 rounded-full flex items-center justify-center text-xs transition-colors"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
                {mediaLoadError && <p className="text-xs text-red-400 mt-1">{t('compose.mediaLoadError')}</p>}
                {isImage(composeStore.mediaUrl) && (
                  <ImageFormatEditor
                    mediaUrl={composeStore.mediaUrl}
                    aspect={imageSize}
                    onApply={(url) => { composeStore.mediaUrl = url }}
                  />
                )}

                {isImage(composeStore.mediaUrl) && aiConfigured && !mediaLoadError && (
                  <div className="mt-2">
                    <button
                      onClick={generateCaption}
                      disabled={captionGenerating}
                      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                        captionGenerating
                          ? 'border-violet-700/40 text-violet-400 bg-violet-900/20'
                          : 'border-violet-700/60 text-violet-300 hover:bg-violet-900/30 hover:border-violet-600'
                      }`}
                    >
                      {captionGenerating && (
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                      )}
                      {captionGenerating ? t('compose.captionGenerating') : t('compose.captionGenerate')}
                    </button>
                    {captionError && <p className="text-xs text-red-400 mt-1">{t('compose.captionError')}</p>}
                  </div>
                )}
              </div>
            )}

            {/* Upload progress */}
            {uploading && (
              <div className="px-4 pb-3 flex items-center gap-2 text-sm text-gray-400">
                <svg className="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                {t('compose.uploading')}
              </div>
            )}

            {uploadError && <div className="px-4 pb-3 text-xs text-red-400">{uploadError}</div>}

            {/* Paste-URL fallback input */}
            {showUrlInput && !composeStore.mediaUrl.trim() && !uploading && (
              <div className="px-4 pb-3">
                <input
                  ref={urlInputRef}
                  value={pasteUrlValue}
                  onChange={(e) => setPasteUrlValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyPastedUrl()}
                  onBlur={applyPastedUrl}
                  type="url"
                  placeholder={t('compose.mediaUrlPlaceholder')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/x-msvideo"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Toolbar */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-t border-gray-800">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className={`flex items-center gap-1.5 text-xs hover:text-gray-300 transition-colors disabled:opacity-40 px-2 py-1 rounded hover:bg-gray-800 ${
                  composeStore.mediaUrl ? 'text-blue-400' : 'text-gray-500'
                }`}
                title={t('compose.uploadFile')}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {t('compose.addMedia')}
              </button>

              {!composeStore.mediaUrl && !uploading && (
                <button
                  onClick={toggleUrlInput}
                  className={`text-xs transition-colors ${showUrlInput ? 'text-blue-400' : 'text-gray-600 hover:text-gray-400'}`}
                >
                  {showUrlInput ? t('compose.cancelUrl') : t('compose.pasteUrl')}
                </button>
              )}

              <button
                onClick={toggleAiPanel}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                  aiPanelOpen ? 'text-violet-400 bg-violet-900/30' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                }`}
              >
                <span>✨</span>
                <span>{t('compose.aiButton')}</span>
              </button>

              {imageGenAvailable && (
                <button
                  onClick={toggleImagePanel}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                    imagePanelOpen ? 'text-emerald-400 bg-emerald-900/30' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  <i className="fa-solid fa-image text-[10px]"></i>
                  <span>{t('compose.imageButton')}</span>
                </button>
              )}

              <span
                className={`ml-auto text-xs font-mono ${
                  overLimit ? 'text-red-400' : charNearLimit ? 'text-amber-400' : 'text-gray-600'
                }`}
              >
                {composeStore.content.length}
                {composeStore.activeCharLimit ? `/${composeStore.activeCharLimit}` : null}
              </span>
            </div>

            {/* AI Panel */}
            {aiPanelOpen && (
              <div className="border-t border-violet-900/40 bg-violet-950/20 px-4 py-3 space-y-3">
                {!aiConfigured ? (
                  <p className="text-xs text-amber-400 flex items-center gap-1.5">
                    <span>⚠</span>{t('compose.aiNotConfigured')}
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-gray-500">
                      {aiContextAccount ? <span>✨ {t('compose.aiContextFrom', { account: aiContextAccount })}</span> : <span>{t('compose.aiNoContext')}</span>}
                    </p>

                    <input
                      value={aiTopic}
                      onChange={(e) => setAiTopic(e.target.value)}
                      type="text"
                      placeholder={t('compose.aiTopicPlaceholder')}
                      disabled={generating}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-violet-500 disabled:opacity-50"
                    />

                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={aiGoal}
                        onChange={(e) => setAiGoal(e.target.value)}
                        disabled={generating}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-violet-500 disabled:opacity-50"
                      >
                        <option value="">{t('compose.aiGoal')}</option>
                        <option value="promote">{t('compose.aiGoals.promote')}</option>
                        <option value="engage">{t('compose.aiGoals.engage')}</option>
                        <option value="inform">{t('compose.aiGoals.inform')}</option>
                        <option value="entertain">{t('compose.aiGoals.entertain')}</option>
                        <option value="announce">{t('compose.aiGoals.announce')}</option>
                      </select>

                      <select
                        value={aiToneOverride}
                        onChange={(e) => setAiToneOverride(e.target.value)}
                        disabled={generating}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-violet-500 disabled:opacity-50"
                      >
                        <option value="">{t('compose.aiToneDefault')}</option>
                        <option value="professional">Professional</option>
                        <option value="casual">Casual</option>
                        <option value="friendly">Friendly</option>
                        <option value="formal">Formal</option>
                        <option value="humorous">Humorous</option>
                        <option value="inspiring">Inspiring</option>
                        <option value="educational">Educational</option>
                      </select>

                      <div className="ml-auto flex items-center gap-2">
                        {aiError && <p className="text-xs text-red-400">{t('compose.aiError')}</p>}

                        {generating ? (
                          <button
                            onClick={stopGeneration}
                            className="px-3 py-1.5 text-xs font-medium bg-red-700 hover:bg-red-600 rounded-lg transition-colors"
                          >
                            {t('compose.aiStop')}
                          </button>
                        ) : (
                          <button
                            onClick={generatePost}
                            disabled={!aiTopic.trim()}
                            className="px-3 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-700 disabled:opacity-40 rounded-lg transition-colors flex items-center gap-1"
                          >
                            <span>✨ {t('compose.aiGenerate')}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {hasCompetitorSummaries && (
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <input
                          id="useCompetitorCtx"
                          type="checkbox"
                          checked={useCompetitorContext}
                          onChange={(e) => setUseCompetitorContext(e.target.checked)}
                          className="accent-violet-500"
                        />
                        <label htmlFor="useCompetitorCtx" className="cursor-pointer select-none">
                          🔍 {t('compose.aiUseCompetitors')}
                        </label>
                        <span className="text-gray-600">— {t('compose.aiUseCompetitorsHint', { names: competitorNames })}</span>
                      </div>
                    )}

                    <div className="border-t border-violet-900/30 pt-2 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={researchAudience}
                          disabled={researchLoading || !aiContextAccount}
                          className="flex items-center gap-1 text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 border border-gray-700 rounded-lg transition-colors text-gray-300"
                        >
                          <i className={`fa-solid fa-magnifying-glass-chart text-[10px] ${researchLoading ? 'animate-pulse' : ''}`}></i>
                          {researchLoading ? t('compose.researching') : t('compose.researchAudience')}
                        </button>
                        {researchBriefAt && <span className="text-xs text-gray-600">{researchBriefAgeLabel()}</span>}
                        {researchBrief && (
                          <button
                            onClick={() => setResearchBriefOpen(!researchBriefOpen)}
                            className="ml-auto text-xs text-gray-600 hover:text-gray-400"
                          >
                            {researchBriefOpen ? '▲' : '▼'} {t('compose.researchBriefLabel')}
                          </button>
                        )}
                      </div>

                      {researchBrief && researchBriefOpen && (
                        <div className="bg-gray-800/60 rounded-lg p-2.5 text-xs text-gray-300 space-y-1.5">
                          {Boolean(researchBrief.painPoints?.length) && (
                            <div>
                              <span className="text-gray-500 font-medium">Pain points: </span>
                              {researchBrief.painPoints.slice(0, 3).join(' · ')}
                            </div>
                          )}
                          {Boolean(researchBrief.contentAngles?.length) && (
                            <div>
                              <span className="text-gray-500 font-medium">Content angles: </span>
                              {researchBrief.contentAngles.slice(0, 3).join(' · ')}
                            </div>
                          )}
                          {Boolean(researchBrief.communityLanguage?.length) && (
                            <div>
                              <span className="text-gray-500 font-medium">Community language: </span>
                              {researchBrief.communityLanguage.slice(0, 5).join(', ')}
                            </div>
                          )}
                        </div>
                      )}

                      {researchBrief && (
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <input
                            id="useResearchCtx"
                            type="checkbox"
                            checked={useResearchBrief}
                            onChange={(e) => setUseResearchBrief(e.target.checked)}
                            className="accent-violet-500"
                          />
                          <label htmlFor="useResearchCtx" className="cursor-pointer select-none">
                            {t('compose.useResearchBrief')}
                          </label>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Image Generation Panel */}
          {imagePanelOpen && imageGenAvailable && (
            <div className="bg-gray-900 border border-emerald-800/40 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
                <i className="fa-solid fa-image text-emerald-400 text-xs"></i>
                <span className="text-sm font-medium text-white">{t('compose.imageGenerateTitle')}</span>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-gray-500 hidden sm:inline">{t('compose.imageProvider')}</span>
                  <div className="flex rounded-lg overflow-hidden border border-gray-700">
                    {imageProviders.map((p) => (
                      <button
                        key={p.name}
                        onClick={() => setImageProvider(p.name)}
                        title={p.model}
                        className={`px-2.5 py-1 text-xs transition-colors ${
                          imageProvider === p.name ? 'bg-emerald-700 text-white' : 'text-gray-400 hover:text-gray-300 bg-gray-800'
                        }`}
                      >
                        {t(`compose.imageProviders.${p.name}`)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="px-4 py-3 space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">{t('compose.imagePrompt')}</label>
                  <textarea
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    rows={2}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 resize-none focus:outline-none focus:border-emerald-600 placeholder-gray-600"
                    placeholder={t('compose.imagePromptPlaceholder')}
                  />
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  <div className="flex rounded-lg overflow-hidden border border-gray-700 shrink-0">
                    {IMAGE_SIZES.map((s) => (
                      <button
                        key={s.value}
                        onClick={() => setImageSize(s.value)}
                        disabled={instagramDestinations.length > 0 && s.value !== instagramImageAspect}
                        className={`px-2.5 py-1 text-xs transition-colors ${
                          imageSize === s.value ? 'bg-emerald-700 text-white' : 'text-gray-400 hover:text-gray-300 bg-gray-800'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>

                  <select
                    value={imageFit}
                    onChange={(e) => setImageFit(e.target.value as 'contain' | 'cover')}
                    aria-label={t('imageFormats.fit')}
                    className="bg-gray-800 rounded p-1 text-xs"
                  >
                    <option value="contain">{t('imageFormats.contain')}</option>
                    <option value="cover">{t('imageFormats.cover')}</option>
                  </select>

                  <button
                    onClick={() => setImageQuality((prev) => (prev === 'hd' ? 'standard' : 'hd'))}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border transition-colors shrink-0 ${
                      imageQuality === 'hd'
                        ? 'bg-amber-700/40 border-amber-600 text-amber-300'
                        : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                    }`}
                  >
                    <i className="fa-solid fa-star text-[9px]"></i> HD
                  </button>

                  <div className="flex rounded-lg overflow-hidden border border-gray-700 shrink-0">
                    <button
                      onClick={() => setImageStyle('vivid')}
                      className={`px-2.5 py-1 text-xs transition-colors ${
                        imageStyle === 'vivid' ? 'bg-violet-700 text-white' : 'text-gray-400 hover:text-gray-300 bg-gray-800'
                      }`}
                    >
                      {t('compose.imageStyleVivid')}
                    </button>
                    <button
                      onClick={() => setImageStyle('natural')}
                      className={`px-2.5 py-1 text-xs transition-colors ${
                        imageStyle === 'natural' ? 'bg-violet-700 text-white' : 'text-gray-400 hover:text-gray-300 bg-gray-800'
                      }`}
                    >
                      {t('compose.imageStyleNatural')}
                    </button>
                  </div>
                </div>

                {composeStore.mediaUrl && isImage(composeStore.mediaUrl) && activeImageProvider?.imageVariations !== false && (
                  <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useImageVariation}
                      onChange={(e) => setUseImageVariation(e.target.checked)}
                      className="w-3.5 h-3.5 accent-emerald-500"
                    />
                    {t('compose.imageVariation')}
                  </label>
                )}

                <div className="flex items-center gap-3">
                  <button
                    onClick={generateImage}
                    disabled={imageGenerating || (!imagePrompt.trim() && !useImageVariation)}
                    className="flex items-center gap-1.5 text-xs px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg transition-colors font-medium"
                  >
                    {imageGenerating ? (
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : (
                      <i className="fa-solid fa-wand-magic-sparkles text-[10px]"></i>
                    )}
                    {imageGenerating ? t('compose.imageGenerating') : t('compose.imageGenerate')}
                  </button>
                  {imageError && <span className="text-xs text-red-400">{imageError}</span>}
                  {imageGenerating && <span className="text-xs text-gray-500">{t('compose.imageGeneratingHint')}</span>}
                </div>

                {generatedImage && (
                  <div className="space-y-2 text-xs">
                    <img src={generatedImage.mediaUrl} alt="" className="max-h-80 max-w-full object-contain rounded-lg" />
                    <p>{generatedImage.width} × {generatedImage.height} · {generatedImage.aspect}</p>
                    <p className="text-gray-400">{t('imageFormats.originalKept')}</p>
                    <button
                      onClick={() => {
                        composeStore.mediaUrl = generatedImage.mediaUrl
                        setGeneratedImage(null)
                        setImagePanelOpen(false)
                        setMediaLoadError(false)
                      }}
                      className="bg-emerald-700 rounded px-3 py-2"
                    >
                      {t('imageFormats.apply')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Hashtag suggestions */}
          {(suggestedHashtags.length > 0 || hashtagsLoading) && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-gray-500">{t('compose.hashtagSuggestions')}</span>
                {hashtagsLoading ? (
                  <span className="text-xs text-gray-600 animate-pulse">{t('compose.hashtagsLoading')}</span>
                ) : (
                  <button
                    onClick={suggestHashtags}
                    className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
                    title={t('compose.hashtagsRefresh')}
                  >
                    ↻
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {suggestedHashtags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => insertHashtag(tag)}
                    disabled={contentHasTag(tag)}
                    className={`text-xs px-2.5 py-0.5 rounded-full border transition-colors ${
                      contentHasTag(tag)
                        ? 'border-gray-700 text-gray-600 cursor-default'
                        : 'border-violet-700/60 text-violet-300 hover:bg-violet-900/30 hover:border-violet-600'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Hashtag Groups */}
          {Boolean(hashtagStore.groups.length) && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500 mb-2">{t('compose.hashtagGroups')}</p>
              <div className="flex flex-wrap gap-1.5">
                {hashtagStore.groups.map((group) => (
                  <button
                    key={group._id}
                    onClick={() => insertHashtagGroup(group.hashtags)}
                    className="text-xs px-2.5 py-1 rounded-lg border border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/30 transition-colors"
                    title={group.hashtags.join(' ')}
                  >
                    # {group.name}
                    <span className="text-emerald-600 ml-1">{group.hashtags.length}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* First Comment */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <button
              onClick={() => setFirstCommentOpen(!firstCommentOpen)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-300 hover:text-gray-100 hover:bg-gray-800/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span>{t('compose.firstCommentToggle')}</span>
                {Boolean(composeStore.firstComment.trim()) && <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />}
              </div>
              <svg className={`w-4 h-4 text-gray-600 transition-transform ${firstCommentOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {firstCommentOpen && (
              <div className="border-t border-gray-800 p-4 space-y-2">
                <textarea
                  value={composeStore.firstComment}
                  onChange={(e) => { composeStore.firstComment = e.target.value }}
                  placeholder={t('compose.firstCommentPlaceholder')}
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-600 resize-none focus:outline-none focus:border-blue-500 text-sm leading-relaxed p-3"
                />
                <p className="text-xs text-gray-500">{t('compose.firstCommentHint')}</p>
              </div>
            )}
          </div>

          {/* Instagram warning */}
          {igSelectedWithoutMedia && (
            <div className="flex items-center gap-2 bg-amber-900/30 border border-amber-700/50 rounded-xl px-4 py-2.5 text-xs text-amber-300">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
              {t('compose.igImageRequired')}
            </div>
          )}

          {/* Schedule + Post */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <input
                value={composeStore.scheduledAt}
                onChange={(e) => { composeStore.scheduledAt = e.target.value }}
                type="datetime-local"
                className="flex-1 bg-transparent text-sm text-gray-300 focus:outline-none min-w-0"
                title={t('compose.scheduleTitle')}
              />
              <select
                value={scheduleTimezone}
                onChange={(e) => setScheduleTimezone(e.target.value)}
                title={t('compose.timezoneLabel')}
                className="text-xs bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-gray-400 focus:outline-none focus:border-amber-500 flex-shrink-0 max-w-[130px]"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
              <span className="text-xs text-gray-600 flex-shrink-0 hidden sm:block">{timezoneAbbr}</span>
              {Boolean(composeStore.scheduledAt) && (
                <button
                  onClick={() => { composeStore.scheduledAt = '' }}
                  className="text-gray-600 hover:text-gray-400 text-xs flex-shrink-0"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Suggested times strip */}
            {(suggestionsLoading || suggestions.length > 0) && (
              <div className="flex items-start gap-2 flex-wrap">
                <span className="text-xs text-gray-500 shrink-0 mt-0.5">{t('compose.suggestedTimes')}</span>
                {suggestionsLoading ? (
                  <span className="text-xs text-gray-600 animate-pulse">{t('compose.suggestionsLoading')}</span>
                ) : (
                  <>
                    {suggestions.map((s) => (
                      <button
                        key={s.utc}
                        onClick={() => applySuggestion(s)}
                        className={`text-xs px-2.5 py-0.5 rounded-full border border-amber-700/60 text-amber-300 hover:bg-amber-900/30 transition-colors ${
                          composeStore.scheduledAt === utcToNaiveDatetimeString(s.utc, scheduleTimezone)
                            ? 'opacity-50 ring-1 ring-amber-500'
                            : ''
                        }`}
                      >
                        {formatSuggestionChip(s)}
                      </button>
                    ))}
                    <span className="text-xs text-gray-600 self-center">
                      — {t(suggestionsSource === 'history' ? 'compose.suggestionsFromHistory' : 'compose.suggestionsFromDefaults')}
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={handleSaveDraft}
                disabled={composeStore.savingDraft || !composeStore.content.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 bg-gray-700 hover:bg-gray-600 text-gray-200"
              >
                {composeStore.savingDraft
                  ? t('compose.savingDraft')
                  : composeStore.draftId
                  ? t('compose.updateDraft')
                  : t('compose.saveDraft')}
              </button>
              <button
                onClick={handlePost}
                disabled={composeStore.sending || !canPost}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 ${
                  composeStore.scheduledAt ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {composeStore.sending ? t('compose.sending') : postButtonLabel}
              </button>
            </div>
          </div>

          {/* Success message */}
          {composeStore.lastResult && (
            <div
              role="status"
              className={`border rounded-xl px-4 py-3 text-sm ${
                composeStore.lastResult.processing
                  ? 'bg-blue-900/30 border-blue-700 text-blue-300'
                  : composeStore.lastResult.ok
                  ? 'bg-green-900/30 border-green-700 text-green-300'
                  : 'bg-red-900/30 border-red-700 text-red-300'
              }`}
            >
              <p>
                {composeStore.lastResult.processing
                  ? t('instagramPublishing.processing')
                  : composeStore.lastResult.ok
                  ? t('compose.successMessage')
                  : t('compose.publishFailed')}
              </p>
              {composeStore.lastResult.processing && (
                <button onClick={() => void composeStore.refreshPostStatus()} className="underline">
                  {t('instagramPublishing.checkStatus')}
                </button>
              )}
              {composeStore.lastResult.error && <p>{composeStore.lastResult.error}</p>}
              {(composeStore.lastResult.results || []).map((result, index) => (
                <p key={index}>
                  {result.platform}{result.accountId ? `: ${result.accountId}` : ''} —{' '}
                  {result.processing ? t('instagramPublishing.processing') : result.success ? t('compose.deliverySucceeded') : result.error}
                </p>
              ))}
            </div>
          )}

          {/* Draft saved message */}
          {draftSavedBanner && (
            <div className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-300">
              {t('compose.draftSaved')}
            </div>
          )}

        </div>
      </div>

      {/* ── Right panel: preview ── */}
      <div className="w-full lg:w-80 flex-shrink-0 bg-gray-900 border-t lg:border-t-0 lg:border-l border-gray-800 flex flex-col overflow-hidden max-h-[90vh] lg:max-h-none">
        <div className="px-4 py-3 border-b border-gray-800 flex-shrink-0">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{t('compose.preview')}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <PostPreview
            selectedDestinations={composeStore.selectedDestinations}
            activeKey={activePreviewKey}
            content={composeStore.content}
            mediaUrl={composeStore.mediaUrl}
            onUpdateActiveKey={(k) => setActivePreviewKey(k)}
          />
        </div>
      </div>
    </div>
  )
}
