export const onRequestPost = async (context) => {

    const formData = await context.request.formData();
  
    const video = formData.get("video");
    const lang = formData.get("lang");
  
    const apiForm = new FormData();
    apiForm.append("video", video);
    apiForm.append("target_lang", lang);
  
    // 외부 AI 더빙 API 호출
    const aiRes = await fetch("https://AI_DUB_API_URL", {
      method: "POST",
      body: apiForm,
      headers: {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    });
  
    const resultVideo = await aiRes.arrayBuffer();
  
    return new Response(resultVideo, {
      headers: {
        "Content-Type": "video/mp4"
      }
    });
  };
  